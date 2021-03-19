// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/cryptography/ECDSA.sol";

/* Internal Imports */
import "./libraries/DataTypes.sol";
import "./libraries/Transitions.sol";
import "./Registry.sol";
import "./strategies/interfaces/IStrategy.sol";

contract TransitionEvaluator {
    using SafeMath for uint256;

    function evaluateTransition(
        bytes memory _transition,
        DataTypes.AccountInfo memory _accountInfo,
        DataTypes.StrategyInfo memory _strategyInfo,
        Registry _registry
    ) external view returns (bytes32[2] memory) {
        // Convert our inputs to memory
        bytes memory transition = _transition;

        // Extract the transition type
        uint8 transitionType = Transitions.extractTransitionType(transition);
        bytes32[2] memory outputs;
        DataTypes.AccountInfo memory updatedAccountInfo;
        DataTypes.StrategyInfo memory updatedStrategyInfo;
        // Apply the transition and record the resulting storage slots
        if (transitionType == Transitions.TRANSITION_TYPE_DEPOSIT) {
            DataTypes.DepositTransition memory deposit = Transitions.decodeDepositTransition(transition);
            updatedAccountInfo = applyDepositTransition(deposit, _accountInfo);
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
        } else if (transitionType == Transitions.TRANSITION_TYPE_WITHDRAW) {
            DataTypes.WithdrawTransition memory withdraw = Transitions.decodeWithdrawTransition(transition);
            updatedAccountInfo = applyWithdrawTransition(withdraw, _accountInfo);
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
        } else if (transitionType == Transitions.TRANSITION_TYPE_COMMIT) {
            DataTypes.CommitTransition memory commit = Transitions.decodeCommitTransition(transition);
            (updatedAccountInfo, updatedStrategyInfo) = applyCommitTransition(
                commit,
                _accountInfo,
                _strategyInfo,
                _registry
            );
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
            outputs[1] = getStrategyInfoHash(updatedStrategyInfo);
        } else if (transitionType == Transitions.TRANSITION_TYPE_UNCOMMIT) {
            DataTypes.UncommitTransition memory uncommit = Transitions.decodeUncommitTransition(transition);
            (updatedAccountInfo, updatedStrategyInfo) = applyUncommitTransition(uncommit, _accountInfo, _strategyInfo);
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
            outputs[1] = getStrategyInfoHash(updatedStrategyInfo);
        } else if (transitionType == Transitions.TRANSITION_TYPE_SYNC_COMMITMENT) {
            DataTypes.CommitmentSyncTransition memory commitmentSync =
                Transitions.decodeCommitmentSyncTransition(transition);
            updatedStrategyInfo = applyCommitmentSyncTransition(commitmentSync, _strategyInfo);
            outputs[1] = getStrategyInfoHash(updatedStrategyInfo);
        } else if (transitionType == Transitions.TRANSITION_TYPE_SYNC_BALANCE) {
            DataTypes.BalanceSyncTransition memory balanceSync = Transitions.decodeBalanceSyncTransition(transition);
            updatedStrategyInfo = applyBalanceSyncTransition(balanceSync, _strategyInfo);
            outputs[1] = getStrategyInfoHash(updatedStrategyInfo);
        } else {
            revert("Transition type not recognized");
        }
        return outputs;
    }

    /**
     * Return the (stateRoot, accountId, strategyId) for this transition.
     */
    function getTransitionStateRootAndAccessIds(bytes calldata _rawTransition)
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
        uint8 transitionType = Transitions.extractTransitionType(rawTransition);
        if (transitionType == Transitions.TRANSITION_TYPE_DEPOSIT) {
            DataTypes.DepositTransition memory transition = Transitions.decodeDepositTransition(rawTransition);
            stateRoot = transition.stateRoot;
            accountId = transition.accountId;
        } else if (transitionType == Transitions.TRANSITION_TYPE_WITHDRAW) {
            DataTypes.WithdrawTransition memory transition = Transitions.decodeWithdrawTransition(rawTransition);
            stateRoot = transition.stateRoot;
            accountId = transition.accountId;
        } else if (transitionType == Transitions.TRANSITION_TYPE_COMMIT) {
            DataTypes.CommitTransition memory transition = Transitions.decodeCommitTransition(rawTransition);
            stateRoot = transition.stateRoot;
            accountId = transition.accountId;
            strategyId = transition.strategyId;
        } else if (transitionType == Transitions.TRANSITION_TYPE_UNCOMMIT) {
            DataTypes.UncommitTransition memory transition = Transitions.decodeUncommitTransition(rawTransition);
            stateRoot = transition.stateRoot;
            accountId = transition.accountId;
            strategyId = transition.strategyId;
        } else if (transitionType == Transitions.TRANSITION_TYPE_SYNC_COMMITMENT) {
            DataTypes.CommitmentSyncTransition memory transition =
                Transitions.decodeCommitmentSyncTransition(rawTransition);
            stateRoot = transition.stateRoot;
            strategyId = transition.strategyId;
        } else if (transitionType == Transitions.TRANSITION_TYPE_SYNC_BALANCE) {
            DataTypes.BalanceSyncTransition memory transition = Transitions.decodeBalanceSyncTransition(rawTransition);
            stateRoot = transition.stateRoot;
            strategyId = transition.strategyId;
        } else if (transitionType == Transitions.TRANSITION_TYPE_INIT) {
            DataTypes.InitTransition memory transition = Transitions.decodeInitTransition(rawTransition);
            stateRoot = transition.stateRoot;
        } else {
            revert("Transition type not recognized");
        }
        return (stateRoot, accountId, strategyId);
    }

    /**
     * Apply a DepositTransition.
     */
    function applyDepositTransition(
        DataTypes.DepositTransition memory _transition,
        DataTypes.AccountInfo memory _accountInfo
    ) internal pure returns (DataTypes.AccountInfo memory) {
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
        if (_transition.assetId >= _accountInfo.idleAssets.length) {
            uint256[] memory idleAssets = new uint256[](_transition.assetId + 1);
            for (uint256 i = 0; i < _accountInfo.idleAssets.length; i++) {
                idleAssets[i] = _accountInfo.idleAssets[i];
            }
            _accountInfo.idleAssets = idleAssets;
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
    ) internal pure returns (DataTypes.AccountInfo memory) {
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
            "Withdraw signature is invalid"
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
        DataTypes.StrategyInfo memory _strategyInfo,
        Registry _registry
    ) internal view returns (DataTypes.AccountInfo memory, DataTypes.StrategyInfo memory) {
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
            "Commit signature is invalid"
        );

        uint256 newStToken;
        if (_strategyInfo.assetBalance == 0 || _strategyInfo.stTokenSupply == 0) {
            require(_strategyInfo.stTokenSupply == 0, "empty strategy stTokenSupply must be zero");
            require(_strategyInfo.pendingCommitAmount == 0, "empty strategy pendingCommitAmount must be zero");
            if (_strategyInfo.assetId == 0) {
                // first time commit of new strategy
                require(_strategyInfo.pendingUncommitAmount == 0, "new strategy pendingUncommitAmount must be zero");
                address strategyAddr = _registry.strategyIndexToAddress(_transition.strategyId);
                address assetAddr = IStrategy(strategyAddr).getAssetAddress();
                _strategyInfo.assetId = _registry.assetAddressToIndex(assetAddr);
            }
            newStToken = _transition.assetAmount;
        } else {
            newStToken = _transition.assetAmount.mul(_strategyInfo.stTokenSupply).div(_strategyInfo.assetBalance);
        }

        _accountInfo.idleAssets[_strategyInfo.assetId] = _accountInfo.idleAssets[_strategyInfo.assetId].sub(
            _transition.assetAmount
        );

        if (_transition.strategyId >= _accountInfo.stTokens.length) {
            uint256[] memory stTokens = new uint256[](_transition.strategyId + 1);
            for (uint256 i = 0; i < _accountInfo.stTokens.length; i++) {
                stTokens[i] = _accountInfo.stTokens[i];
            }
            _accountInfo.stTokens = stTokens;
        }
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
    ) internal pure returns (DataTypes.AccountInfo memory, DataTypes.StrategyInfo memory) {
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
            "Uncommit signature is invalid"
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
        DataTypes.StrategyInfo memory _strategyInfo
    ) internal pure returns (DataTypes.StrategyInfo memory) {
        require(
            _transition.pendingCommitAmount == _strategyInfo.pendingCommitAmount,
            "pending commitment amount not match"
        );
        require(
            _transition.pendingUncommitAmount == _strategyInfo.pendingUncommitAmount,
            "pending uncommitment amount not match"
        );
        _strategyInfo.pendingCommitAmount = 0;
        _strategyInfo.pendingUncommitAmount = 0;

        return _strategyInfo;
    }

    /**
     * Apply a BalanceSyncTransition.
     */
    function applyBalanceSyncTransition(
        DataTypes.BalanceSyncTransition memory _transition,
        DataTypes.StrategyInfo memory _strategyInfo
    ) internal pure returns (DataTypes.StrategyInfo memory) {
        if (_transition.newAssetDelta >= 0) {
            uint256 delta = uint256(_transition.newAssetDelta);
            _strategyInfo.assetBalance = _strategyInfo.assetBalance.add(delta);
        } else {
            uint256 delta = uint256(-_transition.newAssetDelta);
            _strategyInfo.assetBalance = _strategyInfo.assetBalance.sub(delta);
        }
        return _strategyInfo;
    }

    /**
     * Get the hash of the AccountInfo.
     */
    function getAccountInfoHash(DataTypes.AccountInfo memory _accountInfo) internal pure returns (bytes32) {
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
    function getStrategyInfoHash(DataTypes.StrategyInfo memory _strategyInfo) internal pure returns (bytes32) {
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
}
