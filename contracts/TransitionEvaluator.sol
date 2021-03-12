// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/cryptography/ECDSA.sol";

/* Internal Imports */
import {DataTypes} from "./DataTypes.sol";
import {Registry} from "./Registry.sol";
import {IStrategy} from "./strategies/interfaces/IStrategy.sol";

contract TransitionEvaluator {
    using SafeMath for uint256;

    // Transition Types
    uint8 public constant TRANSITION_TYPE_INVALID = 0;
    uint8 public constant TRANSITION_TYPE_DEPOSIT = 1;
    uint8 public constant TRANSITION_TYPE_WITHDRAW = 2;
    uint8 public constant TRANSITION_TYPE_COMMIT = 3;
    uint8 public constant TRANSITION_TYPE_UNCOMMIT = 4;
    uint8 public constant TRANSITION_TYPE_SYNC_COMMITMENT = 5;
    uint8 public constant TRANSITION_TYPE_SYNC_BALANCE = 6;

    Registry registry;

    constructor(address _registryAddress) public {
        registry = Registry(_registryAddress);
    }

    function evaluateTransition(
        bytes calldata _transition,
        DataTypes.AccountInfo calldata _accountInfo,
        DataTypes.StrategyInfo calldata _strategyInfo
    ) external view returns (bytes32[2] memory) {
        // Convert our inputs to memory
        bytes memory transition = _transition;

        // Extract the transition type
        uint8 transitionType = extractTransitionType(transition);
        bytes32[2] memory outputs;
        DataTypes.AccountInfo memory updatedAccountInfo;
        DataTypes.StrategyInfo memory updatedStrategyInfo;
        // Apply the transition and record the resulting storage slots
        if (transitionType == TRANSITION_TYPE_DEPOSIT) {
            DataTypes.DepositTransition memory deposit = decodeDepositTransition(transition);
            updatedAccountInfo = applyDepositTransition(deposit, _accountInfo);
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
        } else if (transitionType == TRANSITION_TYPE_WITHDRAW) {
            DataTypes.WithdrawTransition memory withdraw = decodeWithdrawTransition(transition);
            updatedAccountInfo = applyWithdrawTransition(withdraw, _accountInfo);
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
        } else if (transitionType == TRANSITION_TYPE_COMMIT) {
            DataTypes.CommitTransition memory commit = decodeCommitTransition(transition);
            (updatedAccountInfo, updatedStrategyInfo) = applyCommitTransition(commit, _accountInfo, _strategyInfo);
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
            outputs[1] = getStrategyInfoHash(updatedStrategyInfo);
        } else if (transitionType == TRANSITION_TYPE_UNCOMMIT) {
            DataTypes.UncommitTransition memory uncommit = decodeUncommitTransition(transition);
            (updatedAccountInfo, updatedStrategyInfo) = applyUncommitTransition(uncommit, _accountInfo, _strategyInfo);
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
            outputs[1] = getStrategyInfoHash(updatedStrategyInfo);
        } else if (transitionType == TRANSITION_TYPE_SYNC_COMMITMENT) {
            DataTypes.CommitmentSyncTransition memory commitmentSync = decodeCommitmentSyncTransition(transition);
            updatedStrategyInfo = applyCommitmentSyncTransition(commitmentSync, _strategyInfo);
            outputs[1] = getStrategyInfoHash(updatedStrategyInfo);
        } else if (transitionType == TRANSITION_TYPE_SYNC_BALANCE) {
            DataTypes.BalanceSyncTransition memory balanceSync = decodeBalanceSyncTransition(transition);
            updatedStrategyInfo = applyBalanceSyncTransition(balanceSync, _strategyInfo);
            outputs[1] = getStrategyInfoHash(updatedStrategyInfo);
        } else {
            revert("Transition type not recognized!");
        }
        return outputs;
    }

    function extractTransitionType(bytes memory _bytes) internal pure returns (uint8) {
        uint8 transitionType;

        assembly {
            transitionType := mload(add(_bytes, 0x20))
        }

        return transitionType;
    }

    function getTransitionType(bytes memory _bytes) external pure returns (uint8) {
        return extractTransitionType(_bytes);
    }

    /**
     * Return the access list for this transition.
     */
    function getTransitionStateRootAndAccessList(bytes calldata _rawTransition)
        external
        pure
        returns (
            bytes32,
            uint32,
            uint32
        )
    {
        // Initialize memory rawTransition
        bytes memory rawTransition = _rawTransition;
        // Initialize stateRoot and account and strategy IDs.
        bytes32 stateRoot;
        uint32 accountId;
        uint32 strategyId;
        uint8 transitionType = extractTransitionType(rawTransition);
        if (transitionType == TRANSITION_TYPE_DEPOSIT) {
            DataTypes.DepositTransition memory transition = decodeDepositTransition(rawTransition);
            stateRoot = transition.stateRoot;
            accountId = transition.accountId;
        } else if (transitionType == TRANSITION_TYPE_WITHDRAW) {
            DataTypes.WithdrawTransition memory transition = decodeWithdrawTransition(rawTransition);
            stateRoot = transition.stateRoot;
            accountId = transition.accountId;
        } else if (transitionType == TRANSITION_TYPE_COMMIT) {
            DataTypes.CommitTransition memory transition = decodeCommitTransition(rawTransition);
            stateRoot = transition.stateRoot;
            accountId = transition.accountId;
            strategyId = transition.strategyId;
        } else if (transitionType == TRANSITION_TYPE_UNCOMMIT) {
            DataTypes.UncommitTransition memory transition = decodeUncommitTransition(rawTransition);
            stateRoot = transition.stateRoot;
            accountId = transition.accountId;
            strategyId = transition.strategyId;
        } else if (transitionType == TRANSITION_TYPE_SYNC_COMMITMENT) {
            DataTypes.CommitmentSyncTransition memory transition = decodeCommitmentSyncTransition(rawTransition);
            stateRoot = transition.stateRoot;
            strategyId = transition.strategyId;
        } else if (transitionType == TRANSITION_TYPE_SYNC_BALANCE) {
            DataTypes.BalanceSyncTransition memory transition = decodeBalanceSyncTransition(rawTransition);
            stateRoot = transition.stateRoot;
            strategyId = transition.strategyId;
        } else {
            revert("Transition type not recognized!");
        }
        return (stateRoot, accountId, strategyId);
    }

    /**
     * Apply a DepositTransition.
     */
    function applyDepositTransition(
        DataTypes.DepositTransition memory _transition,
        DataTypes.AccountInfo memory _accountInfo
    ) public pure returns (DataTypes.AccountInfo memory) {
        if (_accountInfo.account == address(0)) {
            // first time deposit of this account
            require(_accountInfo.accountId == 0, "empty account id must be zero");
            require(_accountInfo.idleAssets.length == 0, "empty account idleAssets must be empty");
            require(_accountInfo.stTokens.length == 0, "empty account stTokens must be empty");
            require(_accountInfo.timestamp == 0, "empty account timestamp must be zero");
            _accountInfo.account = _transition.account;
            _accountInfo.accountId = _transition.accountId;
        } else {
            require(_accountInfo.account == _transition.account, "account address not match");
            require(_accountInfo.accountId == _transition.accountId, "account id not match");
        }

        _accountInfo.idleAssets[_transition.assetId] = _accountInfo.idleAssets[_transition.assetId].add(
            _transition.amount
        );

        return _accountInfo;
    }

    /**
     * Apply a WithdrawTransition.
     */
    function applyWithdrawTransition(
        DataTypes.WithdrawTransition memory _transition,
        DataTypes.AccountInfo memory _accountInfo
    ) public pure returns (DataTypes.AccountInfo memory) {
        bytes32 txHash =
            keccak256(
                abi.encodePacked(
                    _transition.transitionType,
                    _transition.account,
                    _transition.assetId,
                    _transition.amount,
                    _transition.timestamp
                )
            );
        bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(txHash);
        require(
            ECDSA.recover(prefixedHash, _transition.signature) == _accountInfo.account,
            "Withdraw signature is invalid!"
        );

        require(_accountInfo.accountId == _transition.accountId, "account id not match");
        require(_accountInfo.timestamp < _transition.timestamp, "timestamp should monotonically increasing");
        _accountInfo.timestamp = _transition.timestamp;

        _accountInfo.idleAssets[_transition.assetId] = _accountInfo.idleAssets[_transition.assetId].sub(
            _transition.amount
        );

        return _accountInfo;
    }

    /**
     * Apply a CommitTransition.
     */
    function applyCommitTransition(
        DataTypes.CommitTransition memory _transition,
        DataTypes.AccountInfo memory _accountInfo,
        DataTypes.StrategyInfo memory _strategyInfo
    ) public view returns (DataTypes.AccountInfo memory, DataTypes.StrategyInfo memory) {
        bytes32 txHash =
            keccak256(
                abi.encodePacked(
                    _transition.transitionType,
                    _transition.strategyId,
                    _transition.assetAmount,
                    _transition.timestamp
                )
            );
        bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(txHash);
        require(
            ECDSA.recover(prefixedHash, _transition.signature) == _accountInfo.account,
            "Commit signature is invalid!"
        );

        uint256 newStToken;
        if (_strategyInfo.assetId == 0) {
            // first time commit of this strategy
            require(_strategyInfo.assetBalance == 0, "empty strategy assetBalance must be zero");
            require(_strategyInfo.stTokenSupply == 0, "empty strategy stTokenSupply must be zero");
            require(_strategyInfo.pendingCommitAmount == 0, "empty strategy pendingCommitAmount must be zero");
            require(_strategyInfo.pendingUncommitAmount == 0, "empty strategy pendingUncommitAmount must be zero");

            address strategyAddr = registry.strategyIndexToAddress(_transition.strategyId);
            address assetAddr = IStrategy(strategyAddr).getAssetAddress();
            _strategyInfo.assetId = registry.assetAddressToIndex(assetAddr);
            newStToken = _transition.assetAmount;
        } else {
            newStToken = _transition.assetAmount.mul(_strategyInfo.stTokenSupply).div(_strategyInfo.assetBalance);
        }

        _accountInfo.idleAssets[_strategyInfo.assetId] = _accountInfo.idleAssets[_strategyInfo.assetId].sub(
            _transition.assetAmount
        );
        _accountInfo.stTokens[_transition.strategyId] = _accountInfo.stTokens[_transition.strategyId].add(newStToken);
        require(_accountInfo.accountId == _transition.accountId, "account id not match");
        require(_accountInfo.timestamp < _transition.timestamp, "timestamp should monotonically increasing");
        _accountInfo.timestamp = _transition.timestamp;

        _strategyInfo.stTokenSupply = _strategyInfo.stTokenSupply.add(newStToken);
        _strategyInfo.assetBalance = _strategyInfo.assetBalance.add(_transition.assetAmount);
        _strategyInfo.pendingCommitAmount = _strategyInfo.pendingCommitAmount.add(_transition.assetAmount);

        return (_accountInfo, _strategyInfo);
    }

    /**
     * Apply a CommitTransition.
     */
    function applyUncommitTransition(
        DataTypes.UncommitTransition memory _transition,
        DataTypes.AccountInfo memory _accountInfo,
        DataTypes.StrategyInfo memory _strategyInfo
    ) public pure returns (DataTypes.AccountInfo memory, DataTypes.StrategyInfo memory) {
        bytes32 txHash =
            keccak256(
                abi.encodePacked(
                    _transition.transitionType,
                    _transition.strategyId,
                    _transition.stTokenAmount,
                    _transition.timestamp
                )
            );
        bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(txHash);
        require(
            ECDSA.recover(prefixedHash, _transition.signature) == _accountInfo.account,
            "Uncommit signature is invalid!"
        );

        uint256 newIdleAsset =
            _transition.stTokenAmount.mul(_strategyInfo.assetBalance).div(_strategyInfo.stTokenSupply);

        _accountInfo.idleAssets[_strategyInfo.assetId] = _accountInfo.idleAssets[_strategyInfo.assetId].add(
            newIdleAsset
        );
        _accountInfo.stTokens[_transition.strategyId] = _accountInfo.stTokens[_transition.strategyId].sub(
            _transition.stTokenAmount
        );
        require(_accountInfo.accountId == _transition.accountId, "account id not match");
        require(_accountInfo.timestamp < _transition.timestamp, "timestamp should monotonically increasing");
        _accountInfo.timestamp = _transition.timestamp;

        _strategyInfo.stTokenSupply = _strategyInfo.stTokenSupply.sub(_transition.stTokenAmount);
        _strategyInfo.assetBalance = _strategyInfo.assetBalance.sub(newIdleAsset);
        _strategyInfo.pendingUncommitAmount = _strategyInfo.pendingUncommitAmount.add(newIdleAsset);

        return (_accountInfo, _strategyInfo);
    }

    /**
     * Apply a CommitmentSyncTransition.
     */
    function applyCommitmentSyncTransition(
        DataTypes.CommitmentSyncTransition memory _transition,
        DataTypes.StrategyInfo memory // _strategyInfo
    ) public pure returns (DataTypes.StrategyInfo memory) {
        DataTypes.StrategyInfo memory strategyInfo; // TODO: tmp variable, remove later

        require(
            _transition.pendingCommitAmount == strategyInfo.pendingCommitAmount,
            "pending commitment amount not match"
        );
        require(
            _transition.pendingUncommitAmount == strategyInfo.pendingUncommitAmount,
            "pending uncommitment amount not match"
        );
        strategyInfo.pendingCommitAmount = 0;
        strategyInfo.pendingUncommitAmount = 0;

        return strategyInfo;
    }

    /**
     * Apply a BalanceSyncTransition.
     */
    function applyBalanceSyncTransition(
        DataTypes.BalanceSyncTransition memory _transition,
        DataTypes.StrategyInfo memory // _strategyInfo
    ) public pure returns (DataTypes.StrategyInfo memory) {
        DataTypes.StrategyInfo memory strategyInfo; // TODO:  variable, remove later
        strategyInfo.assetBalance = strategyInfo.assetBalance.add(_transition.newAssetDelta);
        return strategyInfo;
    }

    /**
     * Get the hash of the AccountInfo.
     */
    function getAccountInfoHash(DataTypes.AccountInfo memory _accountInfo) public pure returns (bytes32) {
        // Here we don't use `abi.encode([struct])` because it's not clear
        // how to generate that encoding client-side.
        return
            keccak256(
                abi.encode(
                    _accountInfo.account,
                    _accountInfo.accountId,
                    _accountInfo.idleAssets,
                    _accountInfo.stTokens,
                    _accountInfo.timestamp
                )
            );
    }

    /**
     * Get the hash of the StrategyInfo.
     */
    function getStrategyInfoHash(DataTypes.StrategyInfo memory _strategyInfo) public pure returns (bytes32) {
        // Here we don't use `abi.encode([struct])` because it's not clear
        // how to generate that encoding client-side.
        return
            keccak256(
                abi.encode(
                    _strategyInfo.assetId,
                    _strategyInfo.assetBalance,
                    _strategyInfo.stTokenSupply,
                    _strategyInfo.pendingCommitAmount,
                    _strategyInfo.pendingUncommitAmount
                )
            );
    }

    /************
     * Decoding *
     ***********/

    function decodeDepositTransition(bytes memory _rawBytes) public pure returns (DataTypes.DepositTransition memory) {
        (uint8 transitionType, bytes32 stateRoot, address account, uint32 accountId, uint32 assetId, uint256 amount) =
            abi.decode((_rawBytes), (uint8, bytes32, address, uint32, uint32, uint256));
        DataTypes.DepositTransition memory transition =
            DataTypes.DepositTransition(transitionType, stateRoot, account, accountId, assetId, amount);
        return transition;
    }

    function decodeWithdrawTransition(bytes memory _rawBytes)
        public
        pure
        returns (DataTypes.WithdrawTransition memory)
    {
        (
            uint8 transitionType,
            bytes32 stateRoot,
            address account,
            uint32 accountId,
            uint32 assetId,
            uint256 amount,
            uint64 timestamp,
            bytes memory signature
        ) = abi.decode((_rawBytes), (uint8, bytes32, address, uint32, uint32, uint256, uint64, bytes));
        DataTypes.WithdrawTransition memory transition =
            DataTypes.WithdrawTransition(
                transitionType,
                stateRoot,
                account,
                accountId,
                assetId,
                amount,
                timestamp,
                signature
            );
        return transition;
    }

    function decodeCommitTransition(bytes memory _rawBytes) public pure returns (DataTypes.CommitTransition memory) {
        (
            uint8 transitionType,
            bytes32 stateRoot,
            uint32 accountId,
            uint32 strategyId,
            uint256 assetAmount,
            uint64 timestamp,
            bytes memory signature
        ) = abi.decode((_rawBytes), (uint8, bytes32, uint32, uint32, uint256, uint64, bytes));
        DataTypes.CommitTransition memory transition =
            DataTypes.CommitTransition(
                transitionType,
                stateRoot,
                accountId,
                strategyId,
                assetAmount,
                timestamp,
                signature
            );
        return transition;
    }

    function decodeUncommitTransition(bytes memory _rawBytes)
        public
        pure
        returns (DataTypes.UncommitTransition memory)
    {
        (
            uint8 transitionType,
            bytes32 stateRoot,
            uint32 accountId,
            uint32 strategyId,
            uint256 stTokenAmount,
            uint64 timestamp,
            bytes memory signature
        ) = abi.decode((_rawBytes), (uint8, bytes32, uint32, uint32, uint256, uint64, bytes));
        DataTypes.UncommitTransition memory transition =
            DataTypes.UncommitTransition(
                transitionType,
                stateRoot,
                accountId,
                strategyId,
                stTokenAmount,
                timestamp,
                signature
            );
        return transition;
    }

    function decodeCommitmentSyncTransition(bytes memory _rawBytes)
        public
        pure
        returns (DataTypes.CommitmentSyncTransition memory)
    {
        (
            uint8 transitionType,
            bytes32 stateRoot,
            uint32 strategyId,
            uint256 pendingCommitAmount,
            uint256 pendingUncommitAmount
        ) = abi.decode((_rawBytes), (uint8, bytes32, uint32, uint256, uint256));
        DataTypes.CommitmentSyncTransition memory transition =
            DataTypes.CommitmentSyncTransition(
                transitionType,
                stateRoot,
                strategyId,
                pendingCommitAmount,
                pendingUncommitAmount
            );
        return transition;
    }

    function decodeBalanceSyncTransition(bytes memory _rawBytes)
        public
        pure
        returns (DataTypes.BalanceSyncTransition memory)
    {
        (uint8 transitionType, bytes32 stateRoot, uint32 strategyId, uint256 newAssetDelta) =
            abi.decode((_rawBytes), (uint8, bytes32, uint32, uint256));
        DataTypes.BalanceSyncTransition memory transition =
            DataTypes.BalanceSyncTransition(transitionType, stateRoot, strategyId, newAssetDelta);
        return transition;
    }
}
