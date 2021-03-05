// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

contract DataTypes {
    struct Block {
        bytes32 rootHash;
        bytes32 intentHash; // hash of L2-to-L1 commitment sync transitions
        uint256 blockTime; // blockNum when this rollup block is committed
    }

    struct DepositTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        address account; // must provide L1 address for "pending deposit" handling
        uint32 accountId; // needed for transition evaluation in case of dispute
        uint32 assetId;
        uint256 amount;
    }

    struct WithdrawTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        address account; // must provide L1 target address for "pending withdraw" handling
        uint32 accountId;
        uint32 assetId;
        uint256 amount;
        uint64 timestamp; // Unix epoch (msec, UTC)
        bytes signature;
    }

    struct CommitTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint32 accountId;
        uint32 strategyId;
        uint256 assetAmount;
        uint64 timestamp; // Unix epoch (msec, UTC)
        bytes signature;
    }

    struct UncommitTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint32 accountId;
        uint32 strategyId;
        uint256 stTokenAmount;
        uint64 timestamp; // Unix epoch (msec, UTC)
        bytes signature;
    }

    struct BalanceSyncTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint32 strategyId;
        uint256 newAssetDelta;
    }

    struct CommitmentSyncTransition {
        uint8 transitionType;
        bytes32 stateRoot;
        uint32 strategyId;
        uint256 pendingCommitAmount;
        uint256 pendingUncommitAmount;
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
        uint32 accountId; // mapping only on L2 must be part of stateRoot
        uint256[] idleAssets; // indexed by assetId
        uint256[] stTokens; // indexed by strategyId
        uint64 timestamp; // Unix epoch (msec, UTC)
    }

    struct StrategyInfo {
        uint32 assetId;
        uint256 assetBalance;
        uint256 stTokenSupply;
        uint256 pendingCommitAmount;
        uint256 pendingUncommitAmount;
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
