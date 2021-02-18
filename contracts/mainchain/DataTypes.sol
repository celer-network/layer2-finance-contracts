pragma solidity ^0.6.6;


contract DataTypes {
    struct Block {
        bytes32 rootHash;
    }

    struct DeFiEntry {
        uint32 deFiIndex;
        bool redeem; // intent polarity: false (mint), true (redeem)
        uint256 amount;
        uint256 amountGiven; // accumulator tracking partial amounts given
    }

    struct DeFi {
        DeFiEntry[] entries;
    }

    struct DepositTx {
        uint32 accountIndex;
        uint32 tokenIndex;
        uint256 amount;
    }

    struct WithdrawTx {
        uint32 accountIndex;
        uint32 tokenIndex;
        uint256 amount;
        uint256 nonce;
    }

    struct TransferTx {
        uint32 senderIndex;
        uint32 recipientIndex;
        uint32 tokenIndex;
        uint256 amount;
        uint256 nonce;
    }

    struct CreateAndDepositTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint256 accountSlotIndex;
        uint32 accountIndex;
        uint32 tokenIndex;
        uint256 amount;
        bytes signature;
    }

    struct DepositTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint256 accountSlotIndex;
        uint32 tokenIndex;
        uint256 amount;
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

    struct BuyTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint256 accountSlotIndex;
        uint32 tokenIndex;
        uint32 deFiIndex;
        uint256 amount;
        uint256 nonce;
        bytes signature;
    }

    struct SellTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint256 accountSlotIndex;
        uint32 tokenIndex;
        uint32 deFiIndex;
        uint256 amount;
        uint256 nonce;
        bytes signature;
    }

    struct CreateAndTransferTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint256 senderSlotIndex;
        uint256 recipientSlotIndex;
        uint32 recipientAccountIndex;
        uint32 tokenIndex;
        uint256 amount;
        uint256 nonce;
        bytes signature;
    }

    struct TransferTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint256 senderSlotIndex;
        uint256 recipientSlotIndex;
        uint32 tokenIndex;
        uint256 amount;
        uint256 nonce;
        bytes signature;
    }

    struct Intent {
        uint32 deFiIndex;
        bool redeem; // intent polarity: false (mint), true (redeem)
        uint256 amount; // aggregate amount to mint or redeem from DeFi
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
        uint256[] transferNonces;
        uint256[] withdrawNonces;
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
