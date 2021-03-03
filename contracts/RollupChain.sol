// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/* Internal Imports */
import {DataTypes as dt} from "./DataTypes.sol";
import {MerkleUtils} from "./MerkleUtils.sol";
import {TransitionEvaluator} from "./TransitionEvaluator.sol";
import {Registry} from "./Registry.sol";
import {IStrategy} from "./interfaces/IStrategy.sol";

contract RollupChain {
    using SafeMath for uint256;

    /* Fields */
    // The state transition evaluator
    TransitionEvaluator transitionEvaluator;
    // The Merkle Tree library (currently a contract for ease of testing)
    MerkleUtils merkleUtils;
    // Asset and strategy registry
    Registry registry;

    // All the blocks (prepared and/or executed).
    dt.Block[] public blocks;
    uint256 countExecuted = 0;

    // Track pending deposits roundtrip status across L1->L2->L1.
    // Each deposit record ID is a count++ (i.e. it's a queue).
    // - L1 deposit() creates it in "pending" status
    // - commitBlock() moves it to "done" status
    // - fraudulent block moves it back to "pending" status
    // - executeBlock() deletes it
    enum PendingDepositStatus {Pending, Done}
    struct PendingDeposit {
        address account;
        uint32 assetId;
        uint256 amount;
        uint256 blockId; // rollup block; "pending": baseline of censorship, "done": block holding L2 transition
        PendingDepositStatus status;
    }
    mapping(uint256 => PendingDeposit) public pendingDeposits;
    uint256 pendingDepositsExecuteHead; // moves up inside blockExecute() -- lowest
    uint256 pendingDepositsCommitHead; // moves up inside blockCommit() -- intermediate
    uint256 pendingDepositsTail; // moves up inside L1 deposit() -- highest

    // Track pending withdraws arriving from L2 then done on L1, per target address.
    // - commitBlock() creates it in "pending" status
    // - executeBlock() moves it to "ready" status
    // - fraudulent block moves it back to "pending" status
    // - L1 withdraw(), after deadline passes, gives the funds and deletes it
    enum PendingWithdrawStatus {Pending, Ready}
    struct PendingWithdraw {
        uint32 assetIndex;
        uint256 amount;
        uint256 blockId; // rollup block containing the L2 transition (rollback on fraud)
        uint256 deadline; // cannot L1-withdraw before this deadline (onchain block number)
        PendingWithdrawStatus status;
    }
    mapping(address => PendingWithdraw[]) public pendingWithdraws;

    // Track pending L1-to-L2 balance sync roundrip across L1->L2->L1.
    // Each balance sync record ID is a count++ (i.e. it's a queue).
    // - L1-to-L2 Balance Sync creates in "pending" status
    // - commitBlock() moves it to "done" status
    // - fraudulent block moves it back to "pending" status
    // - executeBlock() deletes it
    enum PendingBalanceSyncStatus {Pending, Done}
    struct PendingBalanceSync {
        uint32 strategyId;
        uint256 balance;
        uint256 blockId; // rollup block; "pending": baseline of censorship, "done": block holding L2 transition
        PendingBalanceSyncStatus status;
    }
    mapping(uint256 => PendingBalanceSync) public pendingBalanceSyncs;
    uint256 pendingBalanceSyncsExecuteHead; // moves up inside blockExecute() -- lowest
    uint256 pendingBalanceSyncsCommitHead; // moves up inside blockCommit() -- intermediate
    uint256 pendingBalanceSyncsTail; // moves up inside L1 Balance Sync -- highest

    // State tree height
    uint256 constant STATE_TREE_HEIGHT = 32;
    // TODO: Set a reasonable wait period
    uint256 constant WITHDRAW_WAIT_PERIOD = 0;

    // TODO: make these modifiable by admin
    uint256 public blockChallengePeriod; // count of onchain block numbers to challenge a rollup block
    uint256 public blockIdCensorshipPeriod; // count of rollup blocks before L2 transition arrives

    address public committerAddress;

    /* Events */
    event RollupBlockCommitted(uint256 blockNumber);
    event BalanceSync(uint32 strategyId, uint256 assetBalance, uint256 syncId);
    event AssetDeposited(address account, address asset, uint256 amount, uint256 depositId);
    event AssetWithdrawn(address account, address asset, uint256 amount);

    /***************
     * Constructor *
     **************/
    constructor(
        uint256 _blockChallengePeriod,
        uint256 _blockIdCensorshipPeriod,
        address _transitionEvaluatorAddress,
        address _merkleUtilsAddress,
        address _registryAddress,
        address _committerAddress
    ) public {
        blockChallengePeriod = _blockChallengePeriod;
        blockIdCensorshipPeriod = _blockIdCensorshipPeriod;
        transitionEvaluator = TransitionEvaluator(_transitionEvaluatorAddress);
        merkleUtils = MerkleUtils(_merkleUtilsAddress);
        registry = Registry(_registryAddress);
        committerAddress = _committerAddress;
    }

    /* Methods */
    function pruneBlocksAfter(uint256 _blockNumber) internal {
        for (uint256 i = _blockNumber; i < blocks.length; i++) {
            delete blocks[i];
        }
    }

    function getCurrentBlockNumber() public view returns (uint256) {
        return blocks.length - 1;
    }

    function setCommitterAddress(address _committerAddress) external {
        committerAddress = _committerAddress;
    }

    function deposit(address _asset, uint256 _amount) public {
        address account = msg.sender;
        uint32 assetId = registry.assetAddressToIndex(_asset);

        require(assetId != 0, "Unknown asset");

        // TODO: native ETH not yet supported; need if/else on asset address.
        require(IERC20(_asset).transferFrom(account, address(this), _amount), "Deposit failed");

        // Add a pending deposit record.
        uint256 depositId = pendingDepositsTail++;
        pendingDeposits[depositId] = PendingDeposit({
            account: account,
            assetId: assetId,
            amount: _amount,
            blockId: blocks.length, // "pending": baseline of censorship delay
            status: PendingDepositStatus.Pending
        });

        emit AssetDeposited(account, _asset, _amount, depositId);
    }

    function withdraw(
        address _account,
        address _asset,
        uint256 _amount, // TODO: remove and determine amount from pending withdraws.
        bytes memory _signature
    ) public {
        require(registry.assetAddressToIndex(_asset) != 0, "Unknown asset");

        // TODO: verify and aggregate based on "ready" status of many pending withdraws.
        // TODO: discuss "signature" content vs reality of amounts in ready withdraws
        // TODO: delete the consumed pending withdraw entries.

        //bytes32 withdrawHash = keccak256(
        //    abi.encodePacked(
        //        address(this),
        //        "withdraw",
        //        _account,
        //        _asset,
        //        _amount,
        //        nonce
        //    )
        //);
        //bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(withdrawHash);
        //require(
        //    ECDSA.recover(prefixedHash, _signature) == _account,
        //    "Withdraw signature is invalid!"
        //);

        require(IERC20(_asset).transfer(_account, _amount), "Withdraw failed");

        emit AssetWithdrawn(_account, _asset, _amount);
    }

    /**
     * Submit a prepared batch as a new rollup block.
     */
    function commitBlock(bytes[] calldata _transitions) external {
        require(msg.sender == committerAddress, "Only the committer may submit blocks");

        uint256 blockNumber = blocks.length;
        bytes32 root = merkleUtils.getMerkleRoot(_transitions);

        // Loop over transition and handle these cases:
        // 1- deposit: update the pending deposit record
        // 2- withdraw: create a pending withdraw record
        // 3- commitment sync: fill the "intents" array for future executeBlock()
        // 4- balance sync: update the pending balance sync record

        uint256[] memory intentIndexes = new uint256[](_transitions.length);
        uint32 numIntents = 0;

        for (uint256 i = 0; i < _transitions.length; i++) {
            uint8 transitionType = transitionEvaluator.getTransitionType(_transitions[i]);
            if (transitionType == transitionEvaluator.TRANSITION_TYPE_DEPOSIT()) {
                // Update the pending deposit record.
                dt.DepositTransition memory dp = transitionEvaluator.decodeDepositTransition(_transitions[i]);
                uint256 depositId = pendingDepositsCommitHead;
                require(depositId < pendingDepositsTail, "invalid deposit transition, no pending deposits");

                PendingDeposit memory pend = pendingDeposits[depositId];
                require(
                    pend.account == dp.account && pend.assetId == dp.assetId && pend.amount == dp.amount,
                    "invalid deposit transition, mismatch or wrong ordering"
                );

                pendingDeposits[depositId].status = PendingDepositStatus.Done;
                pendingDeposits[depositId].blockId = blockNumber; // "done": block holding the transition
                pendingDepositsCommitHead++;
            } else if (transitionType == transitionEvaluator.TRANSITION_TYPE_WITHDRAW()) {
                dt.WithdrawTransition memory wd = transitionEvaluator.decodeWithdrawTransition(_transitions[i]);
                // TODO: handle pending withdraw
            } else if (transitionType == transitionEvaluator.TRANSITION_TYPE_SYNC_COMMITMENT()) {
                intentIndexes[numIntents++] = i;
            } else if (transitionType == transitionEvaluator.TRANSITION_TYPE_SYNC_BALANCE()) {
                dt.BalanceSyncTransition memory bs = transitionEvaluator.decodeBalanceSyncTransition(_transitions[i]);
                // TODO: handle pending balance sync
            }
        }

        // Compute the intent hash.
        bytes32 intentHash = bytes32(0);
        if (numIntents > 0) {
            bytes32[] memory intents = new bytes32[](numIntents);
            for (uint256 i = 0; i < numIntents; i++) {
                intents[i] = keccak256(_transitions[intentIndexes[i]]);
            }

            intentHash = keccak256(abi.encodePacked(intents));
        }

        dt.Block memory rollupBlock = dt.Block({rootHash: root, intentHash: intentHash, blockTime: block.number});
        blocks.push(rollupBlock);

        emit RollupBlockCommitted(blockNumber);
    }

    // Note: only the "intent" transitions (commitment sync) are given to executeBlock() instead of
    // re-sending the whole rollup block.  This includes the case of a rollup block with zero intents.
    function executeBlock(bytes[] calldata _intents) external {
        uint256 blockId = countExecuted;
        require(blockId < blocks.length, "No blocks pending execution");
        require(blocks[blockId].blockTime + blockChallengePeriod < block.number, "Block still in challenge period");

        // Validate the input intent transitions.
        bytes32 intentHash = bytes32(0);
        if (_intents.length > 0) {
            bytes32[] memory hashes = new bytes32[](_intents.length);
            for (uint256 i = 0; i < _intents.length; i++) {
                hashes[i] = keccak256(_intents[i]);
            }

            intentHash = keccak256(abi.encodePacked(hashes));
        }

        require(intentHash == blocks[blockId].intentHash, "Invalid block intent transitions");

        // Decode the intent transitions and execute the strategy updates.
        for (uint256 i = 0; i < _intents.length; i++) {
            dt.CommitmentSyncTransition memory cs = transitionEvaluator.decodeCommitmentSyncTransition(_intents[i]);

            address stAddr = registry.strategyIndexToAddress(cs.strategyId);
            require(stAddr != address(0), "Unknown strategy ID");

            IStrategy(stAddr).syncCommitment(cs.pendingCommitAmount, cs.pendingUncommitAmount);
        }

        countExecuted++;

        // Delete pending deposit records finalized by this block.
        while (pendingDepositsExecuteHead < pendingDepositsCommitHead) {
            PendingDeposit memory pend = pendingDeposits[pendingDepositsExecuteHead];
            if (pend.status != PendingDepositStatus.Done || pend.blockId > blockId) {
                break;
            }
            delete pendingDeposits[pendingDepositsExecuteHead];
            pendingDepositsExecuteHead++;
        }

        // TODO: update pending withdraw and balance sync records.
    }

    // TODO: decide who does the L1-to-L2 balance sync (an external function or
    // an internal side-effect of executeBlock()?

    /**********************
     * Proving Invalidity *
     *********************/

    /**
     * Verify inclusion of the claimed includedStorageSlot & store their results.
     * Note the complexity here is we need to store an empty storage slot as being 32 bytes of zeros
     * to be what the sparse merkle tree expects.
     */
    function verifyAndStoreStorageSlotInclusionProof(dt.IncludedStorageSlot memory _includedStorageSlot) private {
        bytes memory accountInfoBytes = getAccountInfoBytes(_includedStorageSlot.storageSlot.value);
        merkleUtils.verifyAndStore(
            accountInfoBytes,
            uint256(_includedStorageSlot.storageSlot.slotIndex),
            _includedStorageSlot.siblings
        );
    }

    function getStateRootAndStorageSlots(bytes memory _transition)
        public
        returns (
            bool,
            bytes32,
            uint256[] memory
        )
    {
        bool success;
        bytes memory returnData;
        bytes32 stateRoot;
        uint256[] memory storageSlots;
        (success, returnData) = address(transitionEvaluator).call(
            abi.encodeWithSelector(transitionEvaluator.getTransitionStateRootAndAccessList.selector, _transition)
        );

        // If the call was successful let's decode!
        if (success) {
            (stateRoot, storageSlots) = abi.decode((returnData), (bytes32, uint256[]));
        }
        return (success, stateRoot, storageSlots);
    }

    function getStateRootsAndStorageSlots(bytes memory _preStateTransition, bytes memory _invalidTransition)
        public
        returns (
            bool,
            bytes32,
            bytes32,
            uint256[] memory
        )
    {
        bool success;
        bytes memory returnData;
        bytes32 preStateRoot;
        bytes32 postStateRoot;
        uint256[] memory preStateStorageSlots;
        uint256[] memory storageSlots;
        // First decode the prestate root
        (success, returnData) = address(transitionEvaluator).call(
            abi.encodeWithSelector(
                transitionEvaluator.getTransitionStateRootAndAccessList.selector,
                _preStateTransition
            )
        );

        // Make sure the call was successful
        require(success, "If the preStateRoot is invalid, then prove that invalid instead!");
        (preStateRoot, preStateStorageSlots) = abi.decode((returnData), (bytes32, uint256[]));
        // Now that we have the prestateRoot, let's decode the postState
        (success, returnData) = address(transitionEvaluator).call(
            abi.encodeWithSelector(transitionEvaluator.getTransitionStateRootAndAccessList.selector, _invalidTransition)
        );

        // If the call was successful let's decode!
        if (success) {
            (postStateRoot, storageSlots) = abi.decode((returnData), (bytes32, uint256[]));
        }
        return (success, preStateRoot, postStateRoot, storageSlots);
    }

    function verifyWithdrawTransition(address _account, dt.IncludedTransition memory _includedTransition)
        public
        view
        returns (bool)
    {
        require(checkTransitionInclusion(_includedTransition), "Withdraw transition must be included");
        require(
            transitionEvaluator.verifyWithdrawTransition(_account, _includedTransition.transition),
            "Withdraw signature is invalid"
        );

        require(
            getCurrentBlockNumber() - _includedTransition.inclusionProof.blockNumber >= WITHDRAW_WAIT_PERIOD,
            "Withdraw wait period not passed"
        );
        return true;
    }

    /**
     * Checks if a transition is invalid and if it is prunes that block and it's children from the chain.
     */
    function proveTransitionInvalid(
        dt.IncludedTransition memory _preStateIncludedTransition,
        dt.IncludedTransition memory _invalidIncludedTransition,
        dt.IncludedStorageSlot[] memory _transitionStorageSlots
    ) public {
        // For convenience store the transitions
        bytes memory preStateTransition = _preStateIncludedTransition.transition;
        bytes memory invalidTransition = _invalidIncludedTransition.transition;

        /********* #1: CHECK_SEQUENTIAL_TRANSITIONS *********/
        // First verify that the transitions are sequential
        verifySequentialTransitions(_preStateIncludedTransition, _invalidIncludedTransition);

        /********* #2: DECODE_TRANSITIONS *********/
        // Decode our transitions and determine which storage slots we'll need in order to validate the transition
        (bool success, bytes32 preStateRoot, bytes32 postStateRoot, uint256[] memory storageSlotIndexes) =
            getStateRootsAndStorageSlots(preStateTransition, invalidTransition);
        // If not success something went wrong with the decoding...
        if (!success) {
            // Prune the block if it has an incorrectly encoded transition!
            pruneBlocksAfter(_invalidIncludedTransition.inclusionProof.blockNumber);
            return;
        }

        /********* #3: VERIFY_TRANSITION_STORAGE_SLOTS *********/
        // Make sure the storage slots we were given are correct
        for (uint256 i = 0; i < _transitionStorageSlots.length; i++) {
            require(
                _transitionStorageSlots[i].storageSlot.slotIndex == storageSlotIndexes[i],
                "Supplied storage slot index is incorrect!"
            );
        }

        /********* #4: STORE_STORAGE_INCLUSION_PROOFS *********/
        // Now verify and store the storage inclusion proofs
        merkleUtils.setMerkleRootAndHeight(preStateRoot, STATE_TREE_HEIGHT);
        for (uint256 i = 0; i < _transitionStorageSlots.length; i++) {
            verifyAndStoreStorageSlotInclusionProof(_transitionStorageSlots[i]);
        }

        /********* #5: EVALUATE_TRANSITION *********/
        // Now that we've verified and stored our storage in the state tree, lets apply the transaction
        // To do this first let's pull out the storage slots we care about
        dt.StorageSlot[] memory storageSlots = new dt.StorageSlot[](_transitionStorageSlots.length);
        for (uint256 i = 0; i < _transitionStorageSlots.length; i++) {
            storageSlots[i] = _transitionStorageSlots[i].storageSlot;
        }

        bytes memory returnData;
        // Make the external call
        (success, returnData) = address(transitionEvaluator).call(
            abi.encodeWithSelector(transitionEvaluator.evaluateTransition.selector, invalidTransition, storageSlots)
        );

        // Check if it was successful. If not, we've got to prune.
        if (!success) {
            pruneBlocksAfter(_invalidIncludedTransition.inclusionProof.blockNumber);
            return;
        }
        // It was successful so let's decode the outputs to get the new leaf nodes we'll have to insert
        bytes32[] memory outputs = abi.decode((returnData), (bytes32[]));

        /********* #6: UPDATE_STATE_ROOT *********/
        // Now we need to check if the state root is incorrect, to do this we first insert the new leaf values
        for (uint256 i = 0; i < _transitionStorageSlots.length; i++) {
            merkleUtils.updateLeaf(outputs[i], _transitionStorageSlots[i].storageSlot.slotIndex);
        }

        /********* #7: COMPARE_STATE_ROOTS *********/
        // Check if the calculated state root equals what we expect
        if (postStateRoot != merkleUtils.getRoot()) {
            // Prune the block because we found an invalid post state root! Cryptoeconomic validity ftw!
            pruneBlocksAfter(_invalidIncludedTransition.inclusionProof.blockNumber);
            return;
        }

        // Woah! Looks like there's no fraud!
        revert("No fraud detected!");
    }

    /**
     * Verifies that two transitions were included one after another.
     * This is used to make sure we are comparing the correct
     * prestate & poststate.
     */
    function verifySequentialTransitions(
        dt.IncludedTransition memory _transition0,
        dt.IncludedTransition memory _transition1
    ) public view returns (bool) {
        // Verify inclusion
        require(checkTransitionInclusion(_transition0), "The first transition must be included!");
        require(checkTransitionInclusion(_transition1), "The second transition must be included!");

        // Verify that the two transitions are one after another

        // Start by checking if they are in the same block
        if (_transition0.inclusionProof.blockNumber == _transition1.inclusionProof.blockNumber) {
            // If the blocknumber is the same, simply check that transition0 preceeds transition1
            require(
                _transition0.inclusionProof.transitionIndex == _transition1.inclusionProof.transitionIndex - 1,
                "Transitions must be sequential!"
            );
            // Hurray! The transition is valid!
            return true;
        }

        // If not in the same block, we check that:
        // 0) the blocks are one after another
        require(
            _transition0.inclusionProof.blockNumber == _transition1.inclusionProof.blockNumber - 1,
            "Blocks must be one after another or equal."
        );
        // 1) the transitionIndex of transition0 is the last in the block; and
        //require(
        //    _transition0.inclusionProof.transitionIndex ==
        //        blocks[_transition0.inclusionProof.blockNumber].blockSize - 1,
        //    "_transition0 must be last in its block."
        //);
        // 2) the transitionIndex of transition1 is the first in the block
        require(_transition1.inclusionProof.transitionIndex == 0, "_transition0 must be first in its block.");

        // Success!
        return true;
    }

    /**
     * Check to see if a transition was indeed included.
     */
    function checkTransitionInclusion(dt.IncludedTransition memory _includedTransition) public view returns (bool) {
        bytes32 rootHash = blocks[_includedTransition.inclusionProof.blockNumber].rootHash;
        bool isIncluded =
            merkleUtils.verify(
                rootHash,
                _includedTransition.transition,
                _includedTransition.inclusionProof.transitionIndex,
                _includedTransition.inclusionProof.siblings
            );
        return isIncluded;
    }

    /**
     * Get the hash of the transition.
     */
    function getTransitionHash(bytes memory _transition) public pure returns (bytes32) {
        return keccak256(_transition);
    }

    /**
     * Get the bytes value for this storage.
     */
    function getAccountInfoBytes(dt.AccountInfo memory _accountInfo) public pure returns (bytes memory) {
        // If it's an empty storage slot, return 32 bytes of zeros (empty value)
        if (
            _accountInfo.account == 0x0000000000000000000000000000000000000000 &&
            _accountInfo.accountId == 0 &&
            _accountInfo.idleAssets.length == 0 &&
            _accountInfo.stTokens.length == 0 &&
            _accountInfo.timestamp == 0
        ) {
            return abi.encodePacked(uint256(0));
        }
        // Here we don't use `abi.encode([struct])` because it's not clear
        // how to generate that encoding client-side.
        return
            abi.encode(
                _accountInfo.account,
                _accountInfo.accountId,
                _accountInfo.idleAssets,
                _accountInfo.stTokens,
                _accountInfo.timestamp
            );
    }
}
