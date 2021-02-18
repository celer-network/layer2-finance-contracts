pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";

/* Internal Imports */
import {DataTypes} from "./DataTypes.sol";
import {AccountRegistry} from "./AccountRegistry.sol";
import {TokenRegistry} from "./TokenRegistry.sol";


contract TransitionEvaluator {
    using SafeMath for uint256;

    bytes32 constant ZERO_BYTES32 = 0x0000000000000000000000000000000000000000000000000000000000000000;
    // Transition Types
    uint8 constant TRANSITION_TYPE_CREATE_AND_DEPOSIT = 0;
    uint8 constant TRANSITION_TYPE_DEPOSIT = 1;
    uint8 constant TRANSITION_TYPE_WITHDRAW = 2;
    uint8 constant TRANSITION_TYPE_CREATE_AND_TRANSFER = 3;
    uint8 constant TRANSITION_TYPE_TRANSFER = 4;

    AccountRegistry accountRegistry;
    TokenRegistry tokenRegistry;

    constructor(address _accountRegistryAddress, address _tokenRegistryAddress)
        public
    {
        accountRegistry = AccountRegistry(_accountRegistryAddress);
        tokenRegistry = TokenRegistry(_tokenRegistryAddress);
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
        for (uint256 i = 0; i < _storageSlots.length; i++) {
            uint256 slotIndex = _storageSlots[i].slotIndex;
            address account = _storageSlots[i].value.account;
            uint256[] memory balances = _storageSlots[i].value.balances;
            uint256[] memory transferNonces = _storageSlots[i]
                .value
                .transferNonces;
            uint256[] memory withdrawNonces = _storageSlots[i]
                .value
                .withdrawNonces;
            storageSlots[i] = DataTypes.StorageSlot(
                slotIndex,
                DataTypes.AccountInfo(
                    account,
                    balances,
                    transferNonces,
                    withdrawNonces
                )
            );
        }

        // Extract the transition type
        uint8 transitionType = extractTransitionType(transition);
        bytes32[] memory outputs;
        // Apply the transition and record the resulting storage slots
        if (transitionType == TRANSITION_TYPE_CREATE_AND_DEPOSIT) {

                DataTypes.CreateAndDepositTransition memory createAndDeposit
             = decodeCreateAndDepositTransition(transition);


                DataTypes.AccountInfo memory updatedAccountInfo
             = applyCreateAndDepositTransition(
                createAndDeposit,
                storageSlots[0]
            );
            outputs = new bytes32[](1);
            outputs[0] = getAccountInfoHash(updatedAccountInfo);
        } else if (transitionType == TRANSITION_TYPE_DEPOSIT) {

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
        } else if (transitionType == TRANSITION_TYPE_CREATE_AND_TRANSFER) {

                DataTypes.CreateAndTransferTransition memory createAndTransfer
             = decodeCreateAndTransferTransition(transition);


                DataTypes.AccountInfo[2] memory updatedAccountInfos
             = applyCreateAndTransferTransition(
                createAndTransfer,
                [storageSlots[0], storageSlots[1]]
            );
            // Return the hash of both storage (leaf nodes to insert into the tree)
            outputs = new bytes32[](2);
            for (uint256 i = 0; i < updatedAccountInfos.length; i++) {
                outputs[i] = getAccountInfoHash(updatedAccountInfos[i]);
            }
        } else if (transitionType == TRANSITION_TYPE_TRANSFER) {

                DataTypes.TransferTransition memory transfer
             = decodeTransferTransition(transition);


                DataTypes.AccountInfo[2] memory updatedAccountInfos
             = applyTransferTransition(
                transfer,
                [storageSlots[0], storageSlots[1]]
            );
            // Return the hash of both storage (leaf nodes to insert into the tree)
            outputs = new bytes32[](2);
            for (uint256 i = 0; i < updatedAccountInfos.length; i++) {
                outputs[i] = getAccountInfoHash(updatedAccountInfos[i]);
            }
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
        if (transitionType == TRANSITION_TYPE_CREATE_AND_DEPOSIT) {

                DataTypes.CreateAndDepositTransition memory transition
             = decodeCreateAndDepositTransition(rawTransition);
            stateRoot = transition.stateRoot;
            storageSlots = new uint256[](1);
            storageSlots[0] = transition.accountSlotIndex;
        } else if (transitionType == TRANSITION_TYPE_DEPOSIT) {

                DataTypes.DepositTransition memory transition
             = decodeDepositTransition(rawTransition);
            stateRoot = transition.stateRoot;
            storageSlots = new uint256[](1);
            storageSlots[0] = transition.accountSlotIndex;
        } else if (transitionType == TRANSITION_TYPE_WITHDRAW) {

                DataTypes.WithdrawTransition memory transition
             = decodeWithdrawTransition(rawTransition);
            stateRoot = transition.stateRoot;
            storageSlots = new uint256[](1);
            storageSlots[0] = transition.accountSlotIndex;
        } else if (transitionType == TRANSITION_TYPE_CREATE_AND_TRANSFER) {

                DataTypes.CreateAndTransferTransition memory transition
             = decodeCreateAndTransferTransition(rawTransition);
            stateRoot = transition.stateRoot;
            storageSlots = new uint256[](2);
            storageSlots[0] = transition.senderSlotIndex;
            storageSlots[1] = transition.recipientSlotIndex;
        } else if (transitionType == TRANSITION_TYPE_TRANSFER) {

                DataTypes.TransferTransition memory transition
             = decodeTransferTransition(rawTransition);
            stateRoot = transition.stateRoot;
            storageSlots = new uint256[](2);
            storageSlots[0] = transition.senderSlotIndex;
            storageSlots[1] = transition.recipientSlotIndex;
        }
        return (stateRoot, storageSlots);
    }

    function getWithdrawTxHash(DataTypes.WithdrawTx memory _withdrawTx)
        internal
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encodePacked(
                    accountRegistry.accountAddresses(_withdrawTx.accountIndex),
                    tokenRegistry.tokenIndexToTokenAddress(_withdrawTx.tokenIndex),
                    _withdrawTx.amount,
                    _withdrawTx.nonce
                )
            );
    }

    function getTransferTxHash(DataTypes.TransferTx memory _transferTx)
        internal
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encodePacked(
                    accountRegistry.accountAddresses(_transferTx.senderIndex),
                    accountRegistry.accountAddresses(_transferTx.recipientIndex),
                    tokenRegistry.tokenIndexToTokenAddress(_transferTx.tokenIndex),
                    _transferTx.amount,
                    _transferTx.nonce
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
            _accountInfo.transferNonces.length == 0,
            "Transfer nonce array must be empty"
        );
        require(
            _accountInfo.withdrawNonces.length == 0,
            "Withdraw nonce array must be empty"
        );
    }

    /**
     * Apply a CreateAndDepositTransition.
     */
    function applyCreateAndDepositTransition(
        DataTypes.CreateAndDepositTransition memory _transition,
        DataTypes.StorageSlot memory _storageSlot
    ) public view returns (DataTypes.AccountInfo memory) {
        // Verify that the AccountInfo is empty
        verifyEmptyAccountInfo(_storageSlot.value);
        // Now set storage slot to have the address of the registered account
        _storageSlot.value.account = accountRegistry.accountAddresses(_transition.accountIndex);
        // Next create a DepositTransition based on this CreateAndDepositTransition
        DataTypes.DepositTransition memory depositTransition = DataTypes
            .DepositTransition(
            TRANSITION_TYPE_DEPOSIT,
            _transition.stateRoot,
            _transition.accountSlotIndex,
            _transition.tokenIndex,
            _transition.amount,
            _transition.signature
        );
        // Now simply apply the deposit transition as usual
        return applyDepositTransition(depositTransition, _storageSlot);
    }

    /**
     * Apply a DepositTransition.
     */
    function applyDepositTransition(
        DataTypes.DepositTransition memory _transition,
        DataTypes.StorageSlot memory _storageSlot
    ) public view returns (DataTypes.AccountInfo memory) {
        address account = _storageSlot.value.account;

        DataTypes.DepositTx memory depositTx = DataTypes.DepositTx(
            accountRegistry.registeredAccounts(account),
            _transition.tokenIndex,
            _transition.amount
        );

        // TODO (dominator008): Verify signature of depositer

        DataTypes.AccountInfo memory outputStorage;
        uint256 tokenIndex = _transition.tokenIndex;
        uint256 oldBalance = _storageSlot.value.balances[tokenIndex];
        _storageSlot.value.balances[tokenIndex] = oldBalance.add(
            depositTx.amount
        );
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

        DataTypes.WithdrawTx memory withdrawTx = DataTypes.WithdrawTx(
            accountRegistry.registeredAccounts(account),
            _transition.tokenIndex,
            _transition.amount,
            _transition.nonce
        );

        bytes32 txHash = getWithdrawTxHash(withdrawTx);
        bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(txHash);
        require(
            ECDSA.recover(prefixedHash, _transition.signature) == account,
            "Withdraw signature is invalid!"
        );
        DataTypes.AccountInfo memory outputStorage;
        uint256 tokenIndex = _transition.tokenIndex;
        uint256 oldBalance = _storageSlot.value.balances[tokenIndex];
        _storageSlot.value.balances[tokenIndex] = oldBalance.sub(
            withdrawTx.amount
        );
        uint256 oldWithdrawNonce = _storageSlot
            .value
            .withdrawNonces[tokenIndex];
        _storageSlot.value.withdrawNonces[tokenIndex] = oldWithdrawNonce.add(1);
        outputStorage = _storageSlot.value;
        return outputStorage;
    }

    function applyCreateAndTransferTransition(
        DataTypes.CreateAndTransferTransition memory _transition,
        DataTypes.StorageSlot[2] memory _storageSlots
    ) public view returns (DataTypes.AccountInfo[2] memory) {
        DataTypes.StorageSlot memory recipientStorageSlot = _storageSlots[1];
        // Verify that the AccountInfo is empty
        verifyEmptyAccountInfo(recipientStorageSlot.value);
        // Now set storage slot to have the address of the registered account
        recipientStorageSlot.value.account = accountRegistry.accountAddresses(_transition.recipientAccountIndex);
        // Next create a TransferTransition based on this CreateAndTransferTransition
        DataTypes.TransferTransition memory transferTransition = DataTypes
            .TransferTransition(
            TRANSITION_TYPE_TRANSFER,
            _transition.stateRoot,
            _transition.senderSlotIndex,
            _transition.recipientSlotIndex,
            _transition.tokenIndex,
            _transition.amount,
            _transition.nonce,
            _transition.signature
        );
        // Now simply apply the transfer transition as usual
        return applyTransferTransition(transferTransition, _storageSlots);
    }

    /**
     * Apply a TransferTransition.
     */
    function applyTransferTransition(
        DataTypes.TransferTransition memory _transition,
        DataTypes.StorageSlot[2] memory _storageSlots
    ) public view returns (DataTypes.AccountInfo[2] memory) {
        // First construct the transaction from the storage slots
        address sender = _storageSlots[0].value.account;
        address recipient = _storageSlots[1].value.account;
        DataTypes.TransferTx memory transferTx = DataTypes.TransferTx(
            accountRegistry.registeredAccounts(sender),
            accountRegistry.registeredAccounts(recipient),
            _transition.tokenIndex,
            _transition.amount,
            _transition.nonce
        );

        if (accountRegistry.registeredAccounts(sender) != 0) {
            // Next check to see if the signature is valid
            bytes32 txHash = getTransferTxHash(transferTx);
            bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(txHash);
            require(
                ECDSA.recover(prefixedHash, _transition.signature) == sender,
                "Transfer signature is invalid!"
            );
        }

        // Create an array to store our output storage slots
        DataTypes.AccountInfo[2] memory outputStorage;
        // Now we know the signature is correct, let's compute the output of the transaction
        uint256 tokenIndex = _transition.tokenIndex;
        uint256 senderBalance = _storageSlots[0].value.balances[tokenIndex];

        // First let's make sure the sender has enough money
        require(
            senderBalance > transferTx.amount,
            "Sender does not have enough money!"
        );

        // Update the storage slots with the new balances
        uint256 senderOldBalance = _storageSlots[0].value.balances[tokenIndex];
        uint256 recipientOldBalance = _storageSlots[1]
            .value
            .balances[tokenIndex];
        _storageSlots[0].value.balances[tokenIndex] = senderOldBalance.sub(
            transferTx.amount
        );
        _storageSlots[1].value.balances[tokenIndex] = recipientOldBalance.add(
            transferTx.amount
        );
        // Update sender's transfer nonce
        uint256 oldTransferNonce = _storageSlots[0]
            .value
            .transferNonces[tokenIndex];
        _storageSlots[0].value.transferNonces[tokenIndex] = oldTransferNonce
            .add(1);
        // Set the outputs
        outputStorage[0] = _storageSlots[0].value;
        outputStorage[1] = _storageSlots[1].value;
        // Return the outputs!
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
                    _accountInfo.balances,
                    _accountInfo.transferNonces,
                    _accountInfo.withdrawNonces
                )
            );
    }

    /************
     * Decoding *
     ***********/

    function decodeCreateAndDepositTransition(bytes memory _rawBytes)
        internal
        pure
        returns (DataTypes.CreateAndDepositTransition memory)
    {
        // TODO: Decode directly into a struct?
        (
            uint8 transitionType,
            bytes32 stateRoot,
            uint256 accountSlotIndex,
            uint32 accountIndex,
            uint32 tokenIndex,
            uint256 amount,
            bytes memory signature
        ) = abi.decode(
            (_rawBytes),
            (uint8, bytes32, uint256, uint32, uint32, uint256, bytes)
        );
        DataTypes.CreateAndDepositTransition memory transition = DataTypes
            .CreateAndDepositTransition(
            transitionType,
            stateRoot,
            accountSlotIndex,
            accountIndex,
            tokenIndex,
            amount,
            signature
        );
        return transition;
    }

    function decodeDepositTransition(bytes memory _rawBytes)
        internal
        pure
        returns (DataTypes.DepositTransition memory)
    {
        (
            uint8 transitionType,
            bytes32 stateRoot,
            uint256 accountSlotIndex,
            uint32 tokenIndex,
            uint256 amount,
            bytes memory signature
        ) = abi.decode(
            (_rawBytes),
            (uint8, bytes32, uint256, uint32, uint256, bytes)
        );
        DataTypes.DepositTransition memory transition = DataTypes
            .DepositTransition(
            transitionType,
            stateRoot,
            accountSlotIndex,
            tokenIndex,
            amount,
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
            uint256 accountSlotIndex,
            uint32 tokenIndex,
            uint256 amount,
            uint256 nonce,
            bytes memory signature
        ) = abi.decode(
            (_rawBytes),
            (uint8, bytes32, uint256, uint32, uint256, uint256, bytes)
        );
        DataTypes.WithdrawTransition memory transition = DataTypes
            .WithdrawTransition(
            transitionType,
            stateRoot,
            accountSlotIndex,
            tokenIndex,
            amount,
            nonce,
            signature
        );
        return transition;
    }

    function decodeCreateAndTransferTransition(bytes memory _rawBytes)
        internal
        pure
        returns (DataTypes.CreateAndTransferTransition memory)
    {
        (
            uint8 transitionType,
            bytes32 stateRoot,
            uint256 senderSlotIndex,
            uint256 recipientSlotIndex,
            uint32 recipientAccountIndex,
            uint32 tokenIndex,
            uint256 amount,
            uint256 nonce,
            bytes memory signature
        ) = abi.decode(
            (_rawBytes),
            (
                uint8,
                bytes32,
                uint256,
                uint256,
                uint32,
                uint32,
                uint256,
                uint256,
                bytes
            )
        );
        DataTypes.CreateAndTransferTransition memory transition = DataTypes
            .CreateAndTransferTransition(
            transitionType,
            stateRoot,
            senderSlotIndex,
            recipientSlotIndex,
            recipientAccountIndex,
            tokenIndex,
            amount,
            nonce,
            signature
        );
        return transition;
    }

    function decodeTransferTransition(bytes memory _rawBytes)
        internal
        pure
        returns (DataTypes.TransferTransition memory)
    {
        (
            uint8 transitionType,
            bytes32 stateRoot,
            uint256 senderSlotIndex,
            uint256 recipientSlotIndex,
            uint32 tokenIndex,
            uint256 amount,
            uint256 nonce,
            bytes memory signature
        ) = abi.decode(
            (_rawBytes),
            (
                uint8,
                bytes32,
                uint256,
                uint256,
                uint32,
                uint256,
                uint256,
                bytes
            )
        );
        DataTypes.TransferTransition memory transition = DataTypes
            .TransferTransition(
            transitionType,
            stateRoot,
            senderSlotIndex,
            recipientSlotIndex,
            tokenIndex,
            amount,
            nonce,
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

            DataTypes.WithdrawTransition memory transition
         = decodeWithdrawTransition(_rawTransition);
        DataTypes.WithdrawTx memory withdrawTx = DataTypes.WithdrawTx(
            accountRegistry.registeredAccounts(_account),
            transition.tokenIndex,
            transition.amount,
            transition.nonce
        );

        bytes32 txHash = getWithdrawTxHash(withdrawTx);
        bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(txHash);
        require(
            ECDSA.recover(prefixedHash, transition.signature) == _account,
            "Withdraw signature is invalid!"
        );
        return true;
    }
}
