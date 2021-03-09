// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/cryptography/ECDSA.sol";

/* Internal Imports */
import {DataTypes} from "./DataTypes.sol";
import {Registry} from "./Registry.sol";

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
    ) external view returns (bytes32[] memory) {
        // Convert our inputs to memory
        bytes memory transition = _transition;

        // Direct copy not supported by Solidity yet
        /*
        DataTypes.StorageSlot[] memory storageSlots = new DataTypes.StorageSlot[](_storageSlots.length);
        for (uint256 i = 0; i < _storageSlots.length; i++) {
            uint256 slotIndex = _storageSlots[i].slotIndex;
            address account = _storageSlots[i].value.account;
            uint256[] memory balances = _storageSlots[i].value.balances;
            uint256[] memory nonces = _storageSlots[i]
                .value
                .nonces;
            storageSlots[i] = DataTypes.StorageSlot(
                slotIndex,
                DataTypes.AccountInfo(
                    account,
                    balances,
                    nonces
                )
            );
        }
        */

        // Extract the transition type
        uint8 transitionType = extractTransitionType(transition);
        bytes32[] memory outputs;
        // Apply the transition and record the resulting storage slots
        if (transitionType == TRANSITION_TYPE_DEPOSIT) {
            DataTypes.DepositTransition memory deposit = decodeDepositTransition(transition);

            DataTypes.AccountInfo memory updatedAccountInfo = applyDepositTransition(deposit, _accountInfo);
            outputs = new bytes32[](1);
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
        } else if (transitionType == TRANSITION_TYPE_WITHDRAW) {
            DataTypes.WithdrawTransition memory withdraw = decodeWithdrawTransition(transition);

            DataTypes.AccountInfo memory updatedAccountInfo = applyWithdrawTransition(withdraw, _accountInfo);
            outputs = new bytes32[](1);
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
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
        }
        // TODO: handle other transitions
        return (stateRoot, accountId, strategyId);
    }

    /*
    function getWithdrawTxHash(DataTypes.WithdrawTx memory _withdrawTx)
        internal
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encodePacked(
                    accountRegistry.accountAddresses(_withdrawTx.accountIndex),
                    tokenRegistry.assetIndexToAddress(_withdrawTx.assetId),
                    _withdrawTx.amount,
                    _withdrawTx.nonce
                )
            );
    }

    function verifyEmptyAccountInfo(DataTypes.AccountInfo memory _accountInfo)
        internal
        pure
    {
        require(
            _accountInfo.account == 0x0000000000000000000000000000000000000000,
            "Address of empty account must be zero"
        );
        require(
            _accountInfo.balances.length == 0,
            "Balance array must be empty"
        );
        require(
            _accountInfo.nonces.length == 0,
            "Nonce array must be empty"
        );
    }
    */

    /**
     * Apply a DepositTransition.
     */
    function applyDepositTransition(
        DataTypes.DepositTransition memory _transition,
        DataTypes.AccountInfo memory _accountInfo
    ) public view returns (DataTypes.AccountInfo memory) {
        // TODO (dominator008): Verify signature of depositer

        DataTypes.AccountInfo memory outputStorage;
        uint32 assetId = _transition.assetId;
        /*
        address account = _storageSlot.value.account;
        uint256 oldBalance = _storageSlot.value.balances[assetId];
        _storageSlot.value.balances[assetId] = oldBalance.add(
            _transition.amount
        );
        */
        return outputStorage;
    }

    /**
     * Apply a WithdrawTransition.
     */
    function applyWithdrawTransition(
        DataTypes.WithdrawTransition memory _transition,
        DataTypes.AccountInfo memory _accountInfo
    ) public view returns (DataTypes.AccountInfo memory) {
        /*
        address account = _storageSlot.value.account;
        DataTypes.WithdrawTx memory withdrawTx = DataTypes.WithdrawTx(
            accountRegistry.registeredAccounts(account),
            _transition.assetId,
            _transition.amount,
            _transition.nonce
        );

        bytes32 txHash = getWithdrawTxHash(withdrawTx);
        bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(txHash);
        require(
            ECDSA.recover(prefixedHash, _transition.signature) == account,
            "Withdraw signature is invalid!"
        );
        */

        DataTypes.AccountInfo memory outputStorage;
        uint32 assetId = _transition.assetId;
        /*
        uint256 oldBalance = _storageSlot.value.balances[assetId];
        _storageSlot.value.balances[assetId] = oldBalance.sub(
            _transition.amount
        );
        uint256 oldWithdrawNonce = _storageSlot
            .value
            .nonces[assetId];
        _storageSlot.value.nonces[assetId] = oldWithdrawNonce.add(1);
        */
        return outputStorage;
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
}
