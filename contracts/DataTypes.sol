// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;


contract DataTypes {
    struct Block {
        bytes32 rootHash;
    }

    struct Intent {
        uint32 strategyId;
        bool commit; // intent polarity: false (uncommit), true (commit)
        uint256 amount;
    }

    struct DepositTx {
        uint32 accountIndex;
        uint32 tokenIndex;
        uint256 amount;
        uint256 nonce;
    }

    struct WithdrawTx {
        uint32 accountIndex;
        uint32 tokenIndex;
        uint256 amount;
        uint256 nonce;
    }

    struct DepositTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint256 accountSlotIndex;
        uint32 tokenIndex;
        uint256 amount;
        uint256 nonce;
        bytes signature;
    }

    struct WithdrawTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint256 accountSlotIndex;
        uint32 tokenIndex;
        uint256 amount;
        uint256 nonce;
        bytes signature;
    }

    struct CommitTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint256 accountSlotIndex;
        uint32 tokenIndex;
        uint32 strategyId;
        uint256 inAmount;
        uint256 outAmount;
        bytes signature;
    }

    struct UncommitTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint256 accountSlotIndex;
        uint32 tokenIndex;
        uint32 strategyId;
        uint256 inAmount;
        uint256 outAmount;
        bytes signature;
    }

    struct TransitionInclusionProof {
        uint256 blockNumber;
        uint256 transitionIndex;
        bytes32[] siblings;
    }

    struct IncludedTransition {
        bytes transition;
        TransitionInclusionProof inclusionProof;
    }

    struct AccountInfo {
        address account;
        uint256[] balances;
        uint256[] nonces;
    }

    struct StorageSlot {
        uint256 slotIndex;
        AccountInfo value;
    }

    struct IncludedStorageSlot {
        StorageSlot storageSlot;
        bytes32[] siblings;
    }
}
