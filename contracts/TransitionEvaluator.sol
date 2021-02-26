// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";

/* Internal Imports */
import {DataTypes} from "./DataTypes.sol";
import {Registry} from "./Registry.sol";


contract TransitionEvaluator {
    using SafeMath for uint256;

    bytes32 constant ZERO_BYTES32 = 0x0000000000000000000000000000000000000000000000000000000000000000;
    // Transition Types
    uint8 constant TRANSITION_TYPE_CREATE_AND_DEPOSIT = 0;
    uint8 constant TRANSITION_TYPE_DEPOSIT = 1;
    uint8 constant TRANSITION_TYPE_WITHDRAW = 2;
    uint8 constant TRANSITION_TYPE_CREATE_AND_TRANSFER = 3;
    uint8 constant TRANSITION_TYPE_TRANSFER = 4;

    Registry registry;

    constructor(address _registryAddress)
        public
    {
        registry = Registry(_registryAddress);
    }

    function evaluateTransition(
        bytes calldata _transition,
        DataTypes.StorageSlot[] calldata _storageSlots
    ) external view returns (bytes32[] memory) {
        // Convert our inputs to memory
        bytes memory transition = _transition;

        DataTypes.StorageSlot[] memory storageSlots
         = new DataTypes.StorageSlot[](_storageSlots.length);
        // Direct copy not supported by Solidity yet
        /*
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

                DataTypes.DepositTransition memory deposit
             = decodeDepositTransition(transition);


                DataTypes.AccountInfo memory updatedAccountInfo
             = applyDepositTransition(deposit, storageSlots[0]);
            outputs = new bytes32[](1);
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
        } else if (transitionType == TRANSITION_TYPE_WITHDRAW) {

                DataTypes.WithdrawTransition memory withdraw
             = decodeWithdrawTransition(transition);


                DataTypes.AccountInfo memory updatedAccountInfo
             = applyWithdrawTransition(withdraw, storageSlots[0]);
            outputs = new bytes32[](1);
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
        } else {
            revert("Transition type not recognized!");
        }
        return outputs;
    }

    function extractTransitionType(bytes memory _bytes)
        internal
        pure
        returns (uint8)
    {
        uint8 transitionType;

        assembly {
            transitionType := mload(add(_bytes, 0x01))
        }

        return transitionType;
    }

    /**
     * Return the access list for this transition.
     */
    function getTransitionStateRootAndAccessList(bytes calldata _rawTransition)
        external
        pure
        returns (bytes32, uint256[] memory)
    {
        // Initialize memory rawTransition
        bytes memory rawTransition = _rawTransition;
        // Initialize stateRoot and storageSlots
        bytes32 stateRoot;
        uint256[] memory storageSlots;
        uint8 transitionType = extractTransitionType(rawTransition);
        if (transitionType == TRANSITION_TYPE_DEPOSIT) {

                DataTypes.DepositTransition memory transition
             = decodeDepositTransition(rawTransition);
            stateRoot = transition.stateRoot;
            storageSlots = new uint256[](1);
            storageSlots[0] = transition.accountId;
        } else if (transitionType == TRANSITION_TYPE_WITHDRAW) {

                DataTypes.WithdrawTransition memory transition
             = decodeWithdrawTransition(rawTransition);
            stateRoot = transition.stateRoot;
            storageSlots = new uint256[](1);
            storageSlots[0] = transition.accountId;
        }
        return (stateRoot, storageSlots);
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
        DataTypes.StorageSlot memory _storageSlot
    ) public view returns (DataTypes.AccountInfo memory) {
        address account = _storageSlot.value.account;

        // TODO (dominator008): Verify signature of depositer

        DataTypes.AccountInfo memory outputStorage;
        uint32 assetId = _transition.assetId;
        /*
        uint256 oldBalance = _storageSlot.value.balances[assetId];
        _storageSlot.value.balances[assetId] = oldBalance.add(
            _transition.amount
        );
        */
        outputStorage = _storageSlot.value;
        return outputStorage;
    }

    /**
     * Apply a WithdrawTransition.
     */
    function applyWithdrawTransition(
        DataTypes.WithdrawTransition memory _transition,
        DataTypes.StorageSlot memory _storageSlot
    ) public view returns (DataTypes.AccountInfo memory) {
        address account = _storageSlot.value.account;

        /*
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
        outputStorage = _storageSlot.value;
        return outputStorage;
    }

    /**
     * Get the hash of the AccountInfo.
     */
    function getAccountInfoHash(DataTypes.AccountInfo memory _accountInfo)
        public
        pure
        returns (bytes32)
    {
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

    /************
     * Decoding *
     ***********/

    function decodeDepositTransition(bytes memory _rawBytes)
        internal
        pure
        returns (DataTypes.DepositTransition memory)
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
        ) = abi.decode(
            (_rawBytes),
            (uint8, bytes32, address, uint32, uint32, uint256, uint64, bytes)
        );
        DataTypes.DepositTransition memory transition = DataTypes
            .DepositTransition(
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

    function decodeWithdrawTransition(bytes memory _rawBytes)
        public
        pure
        returns (DataTypes.WithdrawTransition memory)
    {
        (
            uint8 transitionType,
            bytes32 stateRoot,
            uint32 accountId,
            address targetAccount,
            uint32 assetId,
            uint256 amount,
            uint64 timestamp,
            bytes memory signature
        ) = abi.decode(
            (_rawBytes),
            (uint8, bytes32, uint32, address, uint32, uint256, uint64, bytes)
        );
        DataTypes.WithdrawTransition memory transition = DataTypes
            .WithdrawTransition(
            transitionType,
            stateRoot,
            accountId,
            targetAccount,
            assetId,
            amount,
            timestamp,
            signature
        );
        return transition;
    }

    /**
     * Verify a WithdrawTransition signature.
     */
    function verifyWithdrawTransition(
        address _account,
        bytes memory _rawTransition
    ) public view returns (bool) {

        /*
            DataTypes.WithdrawTransition memory transition
         = decodeWithdrawTransition(_rawTransition);
        DataTypes.WithdrawTx memory withdrawTx = DataTypes.WithdrawTx(
            accountRegistry.registeredAccounts(_account),
            transition.assetId,
            transition.amount,
            transition.nonce
        );

        bytes32 txHash = getWithdrawTxHash(withdrawTx);
        bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(txHash);
        require(
            ECDSA.recover(prefixedHash, transition.signature) == _account,
            "Withdraw signature is invalid!"
        );
        */
        return true;
    }
}
