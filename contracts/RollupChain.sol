// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/* Internal Imports */
import {DataTypes as dt} from "./DataTypes.sol";
import {TransitionEvaluator} from "./TransitionEvaluator.sol";
import {Registry} from "./Registry.sol";
import {IStrategy} from "./strategies/interfaces/IStrategy.sol";
import "./lib/Lib_MerkleTree.sol";

contract RollupChain is Ownable, Pausable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* Fields */
    // The state transition evaluator
    TransitionEvaluator transitionEvaluator;
    // Asset and strategy registry
    Registry registry;

    // All the blocks (prepared and/or executed).
    dt.Block[] public blocks;
    uint256 public countExecuted = 0;

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

    // Track pending withdraws arriving from L2 then done on L1 across 2 phases.
    // A separate mapping is used for each phase:
    // (1) pendingWithdrawCommits: commitBlock() --> executeBlock(), per blockId
    // (2) pendingWithdraws: executeBlock() --> L1-withdraw, per user account address
    //
    // - commitBlock() creates pendingWithdrawCommits entries for the blockId.
    // - executeBlock() aggregates them into per-account pendingWithdraws entries and
    //   deletes the pendingWithdrawCommits entries.
    // - fraudulent block deletes the pendingWithdrawCommits during the blockId rollback.
    // - L1 withdraw() gives the funds and deletes the account's pendingWithdraws entries.
    struct PendingWithdrawCommit {
        address account;
        uint32 assetId;
        uint256 amount;
    }
    mapping(uint256 => PendingWithdrawCommit[]) public pendingWithdrawCommits;

    mapping(address => mapping(uint32 => uint256)) public pendingWithdraws;

    // Track pending L1-to-L2 balance sync roundrip across L1->L2->L1.
    // Each balance sync record ID is a count++ (i.e. it's a queue).
    // - L1-to-L2 Balance Sync creates in "pending" status
    // - commitBlock() moves it to "done" status
    // - fraudulent block moves it back to "pending" status
    // - executeBlock() deletes it
    enum PendingBalanceSyncStatus {Pending, Done}
    struct PendingBalanceSync {
        uint32 strategyId;
        uint256 delta;
        uint256 blockId; // rollup block; "pending": baseline of censorship, "done": block holding L2 transition
        PendingBalanceSyncStatus status;
    }
    mapping(uint256 => PendingBalanceSync) public pendingBalanceSyncs;
    uint256 pendingBalanceSyncsExecuteHead; // moves up inside blockExecute() -- lowest
    uint256 pendingBalanceSyncsCommitHead; // moves up inside blockCommit() -- intermediate
    uint256 pendingBalanceSyncsTail; // moves up inside L1 Balance Sync -- highest

    // Track the asset balances of strategies to compute deltas after syncBalance() calls.
    mapping(uint32 => uint256) public strategyAssetBalances;

    // per-asset (total deposit - total withdrawal) amount
    mapping(address => uint256) public netDeposits;
    // per-asset (total deposit - total withdrawal) limit
    mapping(address => uint256) public netDepositLimits;

    uint256 public blockChallengePeriod; // delay (in # of ETH blocks) to challenge a rollup block
    uint256 public maxPriorityTxDelay; // delay (in # of rollup blocks) to reflect an L1-initiated tx in a rollup block

    address public operator;

    /* Events */
    event RollupBlockCommitted(uint256 blockNumber);
    event RollupBlockExecuted(uint256 blockNumber);
    event RollupBlockReverted(uint256 blockNumber);
    event BalanceSync(uint32 strategyId, uint256 delta, uint256 syncId);
    event AssetDeposited(address account, uint32 assetId, uint256 amount, uint256 depositId);
    event AssetWithdrawn(address account, uint32 assetId, uint256 amount);

    modifier onlyOperator() {
        require(msg.sender == operator, "caller is not operator");
        _;
    }

    /***************
     * Constructor *
     **************/
    constructor(
        uint256 _blockChallengePeriod,
        uint256 _maxPriorityTxDelay,
        address _transitionEvaluatorAddress,
        address _registryAddress,
        address _operator
    ) public {
        blockChallengePeriod = _blockChallengePeriod;
        maxPriorityTxDelay = _maxPriorityTxDelay;
        transitionEvaluator = TransitionEvaluator(_transitionEvaluatorAddress);
        registry = Registry(_registryAddress);
        operator = _operator;
    }

    /**
     * @dev Called by the owner to pause contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Called by the owner to unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Owner drains one type of tokens when the contract is paused
     * @dev This is for emergency situations.
     * @param _asset drained asset address
     * @param _amount drained asset amount
     * @param _receiver address to receive the drained asset
     */
    function drainToken(
        address _asset,
        uint256 _amount,
        address _receiver
    ) external whenPaused onlyOwner {
        if (_receiver == address(0)) {
            _receiver = msg.sender;
        }
        IERC20(_asset).safeTransfer(_receiver, _amount);
    }

    /**
     * @dev Called by the owner to set blockChallengePeriod
     */
    function setBlockChallengePeriod(uint256 _blockChallengePeriod) external onlyOwner {
        blockChallengePeriod = _blockChallengePeriod;
    }

    /**
     * @dev Called by the owner to set maxPriorityTxDelay
     */
    function setMaxPriorityTxDelay(uint256 _maxPriorityTxDelay) external onlyOwner {
        maxPriorityTxDelay = _maxPriorityTxDelay;
    }

    function getCurrentBlockNumber() public view returns (uint256) {
        return blocks.length - 1;
    }

    function setOperator(address _operator) external onlyOwner {
        operator = _operator;
    }

    function setNetDepositLimit(address _asset, uint256 _limit) external onlyOwner {
        uint32 assetId = registry.assetAddressToIndex(_asset);
        require(assetId != 0, "Unknown asset");
        netDepositLimits[_asset] = _limit;
    }

    function deposit(address _asset, uint256 _amount) external whenNotPaused {
        address account = msg.sender;
        uint32 assetId = registry.assetAddressToIndex(_asset);

        require(assetId != 0, "Unknown asset");

        uint256 netDeposit = netDeposits[_asset].add(_amount);
        require(netDeposit <= netDepositLimits[_asset], "net deposit exceeds limit");
        netDeposits[_asset] = netDeposit;

        // Add a pending deposit record.
        uint256 depositId = pendingDepositsTail++;
        pendingDeposits[depositId] = PendingDeposit({
            account: account,
            assetId: assetId,
            amount: _amount,
            blockId: blocks.length, // "pending": baseline of censorship delay
            status: PendingDepositStatus.Pending
        });

        IERC20(_asset).safeTransferFrom(account, address(this), _amount);
        emit AssetDeposited(account, assetId, _amount, depositId);
    }

    /**
     * @notice Executes pending withdraw of an asset to an account.
     *
     * @param _account The destination account.
     * @param _asset The asset address;
     */
    function withdraw(address _account, address _asset) external whenNotPaused {
        uint32 assetId = registry.assetAddressToIndex(_asset);
        require(assetId > 0, "Asset not registered");

        uint256 amount = pendingWithdraws[_account][assetId];
        require(amount > 0, "Nothing to withdraw");

        if (netDeposits[_asset] < amount) {
            netDeposits[_asset] = 0;
        } else {
            netDeposits[_asset] = netDeposits[_asset].sub(amount);
        }
        pendingWithdraws[_account][assetId] = 0;

        IERC20(_asset).safeTransfer(_account, amount);
        emit AssetWithdrawn(_account, assetId, amount);
    }

    /**
     * Submit a prepared batch as a new rollup block.
     */
    function commitBlock(uint256 _blockId, bytes[] calldata _transitions) external whenNotPaused onlyOperator {
        require(_blockId == blocks.length, "Wrong block ID");

        bytes32[] memory leafs = new bytes32[](_transitions.length);
        for (uint256 i = 0; i < _transitions.length; i++) {
            leafs[i] = keccak256(_transitions[i]);
        }
        bytes32 root = Lib_MerkleTree.getMerkleRoot(leafs);

        // Loop over transition and handle these cases:
        // 1- deposit: update the pending deposit record
        // 2- withdraw: create a pending withdraw-commit record
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
                pendingDeposits[depositId].blockId = _blockId; // "done": block holding the transition
                pendingDepositsCommitHead++;
            } else if (transitionType == transitionEvaluator.TRANSITION_TYPE_WITHDRAW()) {
                // Append the pending withdraw-commit record for this blockId.
                dt.WithdrawTransition memory wd = transitionEvaluator.decodeWithdrawTransition(_transitions[i]);
                pendingWithdrawCommits[_blockId].push(
                    PendingWithdrawCommit({account: wd.account, assetId: wd.assetId, amount: wd.amount})
                );
            } else if (transitionType == transitionEvaluator.TRANSITION_TYPE_SYNC_COMMITMENT()) {
                intentIndexes[numIntents++] = i;
            } else if (transitionType == transitionEvaluator.TRANSITION_TYPE_SYNC_BALANCE()) {
                // Update the pending balance sync record.
                dt.BalanceSyncTransition memory bs = transitionEvaluator.decodeBalanceSyncTransition(_transitions[i]);
                uint256 syncId = pendingBalanceSyncsCommitHead;
                require(syncId < pendingBalanceSyncsTail, "invalid balance sync transition, no pending balance syncs");

                PendingBalanceSync memory pend = pendingBalanceSyncs[syncId];
                require(
                    pend.strategyId == bs.strategyId && pend.delta == bs.newAssetDelta,
                    "invalid balance sync transition, mismatch or wrong ordering"
                );

                pendingBalanceSyncs[syncId].status = PendingBalanceSyncStatus.Done;
                pendingBalanceSyncs[syncId].blockId = _blockId; // "done": block holding the transition
                pendingBalanceSyncsCommitHead++;
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

        dt.Block memory rollupBlock =
            dt.Block({
                rootHash: root,
                intentHash: intentHash,
                blockTime: block.number,
                blockSize: uint32(_transitions.length)
            });
        blocks.push(rollupBlock);

        emit RollupBlockCommitted(_blockId);
    }

    // Note: only the "intent" transitions (commitment sync) are given to executeBlock() instead of
    // re-sending the whole rollup block.  This includes the case of a rollup block with zero intents.
    function executeBlock(bytes[] calldata _intents) external whenNotPaused {
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
            IStrategy strategy = IStrategy(stAddr);

            if (cs.pendingCommitAmount > cs.pendingUncommitAmount) {
                uint256 commitAmount = cs.pendingCommitAmount.sub(cs.pendingUncommitAmount);
                IERC20(strategy.getAssetAddress()).safeIncreaseAllowance(stAddr, commitAmount);
                strategy.aggregateCommit(commitAmount);
                strategyAssetBalances[cs.strategyId] = strategyAssetBalances[cs.strategyId].add(commitAmount);
            } else if (cs.pendingCommitAmount < cs.pendingUncommitAmount) {
                uint256 uncommitAmount = cs.pendingUncommitAmount.sub(cs.pendingCommitAmount);
                strategy.aggregateUncommit(uncommitAmount);
                strategyAssetBalances[cs.strategyId] = strategyAssetBalances[cs.strategyId].sub(uncommitAmount);
            }
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

        // Aggregate the pending withdraw-commit records for this blockId into the final
        // pending withdraw records per account (for later L1 withdraw), and delete them.
        for (uint256 i = 0; i < pendingWithdrawCommits[blockId].length; i++) {
            PendingWithdrawCommit memory pwc = pendingWithdrawCommits[blockId][i];

            // Find and increment this account's assetId total amount
            pendingWithdraws[pwc.account][pwc.assetId] += pwc.amount;
        }

        delete pendingWithdrawCommits[blockId];

        // Delete pending balance sync records finalized by this block.
        while (pendingBalanceSyncsExecuteHead < pendingBalanceSyncsCommitHead) {
            PendingBalanceSync memory pend = pendingBalanceSyncs[pendingBalanceSyncsExecuteHead];
            if (pend.status != PendingBalanceSyncStatus.Done || pend.blockId > blockId) {
                break;
            }
            delete pendingBalanceSyncs[pendingBalanceSyncsExecuteHead];
            pendingBalanceSyncsExecuteHead++;
        }

        emit RollupBlockExecuted(blockId);
    }

    function syncBalance(uint32 _strategyId) external whenNotPaused onlyOperator {
        address stAddr = registry.strategyIndexToAddress(_strategyId);
        require(stAddr != address(0), "Unknown strategy ID");

        uint256 newBalance = IStrategy(stAddr).getBalance();
        uint256 delta = newBalance.sub(strategyAssetBalances[_strategyId]);
        strategyAssetBalances[_strategyId] = newBalance;

        // Add a pending balance sync record.
        uint256 syncId = pendingBalanceSyncsTail++;
        pendingBalanceSyncs[syncId] = PendingBalanceSync({
            strategyId: _strategyId,
            delta: delta,
            blockId: blocks.length, // "pending": baseline of censorship delay
            status: PendingBalanceSyncStatus.Pending
        });

        emit BalanceSync(_strategyId, delta, syncId);
    }

    function disputePriorityTxDelay() external {
        uint256 currentBlockId = getCurrentBlockNumber();

        uint256 pendingCommitHead = pendingDeposits[pendingDepositsCommitHead].blockId;
        uint256 pendingTail = pendingDeposits[pendingDepositsTail].blockId;
        if (pendingCommitHead < pendingTail) {
            if (currentBlockId.sub(pendingCommitHead) > maxPriorityTxDelay) {
                _pause();
                return;
            }
        }

        pendingCommitHead = pendingBalanceSyncs[pendingBalanceSyncsCommitHead].blockId;
        pendingTail = pendingBalanceSyncs[pendingBalanceSyncsTail].blockId;
        if (pendingCommitHead < pendingTail) {
            if (currentBlockId.sub(pendingCommitHead) > maxPriorityTxDelay) {
                _pause();
                return;
            }
        }
        revert("Not exceed max priority tx delay");
    }

    /**
     * Dispute a transition in a block.  Provide the transition proofs of the previous (valid) transition
     * and the disputed transition, the account proof, and the strategy proof.  Both the account proof and
     * strategy proof are always needed even if the disputed transition only updates the account or only
     * updates the strategy because the transition stateRoot = hash(accountStateRoot, strategyStateRoot).
     * If the transition is invalid, prune the chain from that invalid block.
     */
    function disputeTransition(
        dt.TransitionProof memory _prevTransitionProof,
        dt.TransitionProof memory _invalidTransitionProof,
        dt.AccountProof memory _accountProof,
        dt.StrategyProof memory _strategyProof
    ) public {
        uint256 blockId = _invalidTransitionProof.blockNumber;
        require(blocks[blockId].blockTime + blockChallengePeriod > block.number, "Block challenge period is over");

        /********* #1: CHECK_SEQUENTIAL_TRANSITIONS *********/
        // First verify that the transitions are sequential and in their respective block root hashes.
        verifySequentialTransitions(_prevTransitionProof, _invalidTransitionProof);

        /********* #2: DECODE_TRANSITIONS *********/
        // Decode our transitions and determine the account and strategy IDs needed to validate the transition
        (bool ok, bytes32 preStateRoot, bytes32 postStateRoot, uint32 accountId, uint32 strategyId) =
            getStateRootsAndIds(_prevTransitionProof.transition, _invalidTransitionProof.transition);
        // If not success something went wrong with the decoding...
        if (!ok) {
            // Prune the block if it has an incorrectly encoded transition!
            revertBlock(blockId);
            return;
        }

        /********* #3: VERIFY_TRANSITION_ACCOUNT_INDEX *********/
        if (accountId > 0) {
            require(_accountProof.index == accountId, "Supplied account index is incorrect");
        }
        if (strategyId > 0) {
            require(_strategyProof.index == strategyId, "Supplied strategy index is incorrect");
        }

        /********* #4: CHECK_TWO_TREE_STATE_ROOTS *********/
        // Verify that transition stateRoot == hash(accountStateRoot, strategyStateRoot).
        // The account and strategy stateRoots must always be given irrespective of what is being disputed.
        require(
            checkTwoTreeStateRoot(preStateRoot, _accountProof.stateRoot, _strategyProof.stateRoot),
            "Failed combined two-tree stateRoot verification check"
        );

        /********* #5: ACCOUNT_AND_STRATEGY_INCLUSION_PROOFS *********/
        if (accountId > 0) {
            verifyProofInclusion(
                _accountProof.stateRoot,
                keccak256(getAccountInfoBytes(_accountProof.value)),
                _accountProof.index,
                _accountProof.siblings
            );
        }
        if (strategyId > 0) {
            verifyProofInclusion(
                _strategyProof.stateRoot,
                keccak256(getStrategyInfoBytes(_strategyProof.value)),
                _strategyProof.index,
                _strategyProof.siblings
            );
        }

        /********* #6: EVALUATE_TRANSITION *********/
        // Apply the transaction and verify the state root after that.
        bytes memory returnData;
        // Make the external call
        (ok, returnData) = address(transitionEvaluator).call(
            abi.encodeWithSelector(
                transitionEvaluator.evaluateTransition.selector,
                _invalidTransitionProof.transition,
                _accountProof.value,
                _strategyProof.value
            )
        );

        // Check if it was successful. If not, we've got to prune.
        if (!ok) {
            revertBlock(blockId);
            return;
        }

        // It was successful so let's decode the outputs to get the new leaf nodes we'll have to insert
        bytes32[2] memory outputs = abi.decode((returnData), (bytes32[2]));

        /********* #7: UPDATE_STATE_ROOT *********/
        // Now we need to check if the combined new stateRoots of account and strategy Merkle trees is incorrect.
        ok = updateAndVerify(postStateRoot, outputs, _accountProof, _strategyProof);

        /********* #8: DETERMINE_FRAUD *********/
        if (!ok) {
            // Prune the block because we found an invalid post state root! Cryptoeconomic validity ftw!
            revertBlock(blockId);
            return;
        }

        // Woah! Looks like there's no fraud!
        revert("No fraud detected!");
    }

    function getStateRootsAndIds(bytes memory _preStateTransition, bytes memory _invalidTransition)
        public
        returns (
            bool,
            bytes32,
            bytes32,
            uint32,
            uint32
        )
    {
        bool success;
        bytes memory returnData;
        bytes32 preStateRoot;
        bytes32 postStateRoot;
        uint32 accountId;
        uint32 strategyId;

        // First decode the prestate root
        (success, returnData) = address(transitionEvaluator).call(
            abi.encodeWithSelector(
                transitionEvaluator.getTransitionStateRootAndAccessList.selector,
                _preStateTransition
            )
        );

        // Make sure the call was successful
        require(success, "If the preStateRoot is invalid, then prove that invalid instead!");
        (preStateRoot, , ) = abi.decode((returnData), (bytes32, uint32, uint32));

        // Now that we have the prestateRoot, let's decode the postState
        (success, returnData) = address(transitionEvaluator).call(
            abi.encodeWithSelector(transitionEvaluator.getTransitionStateRootAndAccessList.selector, _invalidTransition)
        );

        // If the call was successful let's decode!
        if (success) {
            (postStateRoot, accountId, strategyId) = abi.decode((returnData), (bytes32, uint32, uint32));
        }
        return (success, preStateRoot, postStateRoot, accountId, strategyId);
    }

    /**
     * Get the bytes value for this account.
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

    /**
     * Get the bytes value for this strategy.
     */
    function getStrategyInfoBytes(dt.StrategyInfo memory _strategyInfo) public pure returns (bytes memory) {
        // If it's an empty storage slot, return 32 bytes of zeros (empty value)
        if (
            _strategyInfo.assetId == 0 &&
            _strategyInfo.assetBalance == 0 &&
            _strategyInfo.stTokenSupply == 0 &&
            _strategyInfo.pendingCommitAmount == 0 &&
            _strategyInfo.pendingUncommitAmount == 0
        ) {
            return abi.encodePacked(uint256(0));
        }
        // Here we don't use `abi.encode([struct])` because it's not clear
        // how to generate that encoding client-side.
        return
            abi.encode(
                _strategyInfo.assetId,
                _strategyInfo.assetBalance,
                _strategyInfo.stTokenSupply,
                _strategyInfo.pendingCommitAmount,
                _strategyInfo.pendingUncommitAmount
            );
    }

    /**
     * Verifies that two transitions were included one after another.
     * This is used to make sure we are comparing the correct prestate & poststate.
     */
    function verifySequentialTransitions(dt.TransitionProof memory _tp0, dt.TransitionProof memory _tp1)
        private
        view
        returns (bool)
    {
        // Start by checking if they are in the same block
        if (_tp0.blockNumber == _tp1.blockNumber) {
            // If the blocknumber is the same, check that tp0 preceeds tp1
            require(_tp0.index + 1 == _tp1.index, "Transitions must be sequential");
            require(_tp1.index < blocks[_tp1.blockNumber].blockSize, "_tp1 outside block range");
        } else {
            // If not in the same block, check that:
            // 0) the blocks are one after another
            require(_tp0.blockNumber + 1 == _tp1.blockNumber, "Blocks must be sequential or equal");

            // 1) the index of tp0 is the last in its block
            require(_tp0.index == blocks[_tp0.blockNumber].blockSize - 1, "_tp0 must be last in its block");

            // 2) the index of tp1 is the first in its block
            require(_tp1.index == 0, "_tp1 must be first in its block");
        }

        // Verify inclusion
        require(checkTransitionInclusion(_tp0), "_tp0 must be included in its block");
        require(checkTransitionInclusion(_tp1), "_tp1 must be included in its block");

        return true;
    }

    /**
     * Check to see if a transition was indeed included.
     */
    function checkTransitionInclusion(dt.TransitionProof memory _tp) private view returns (bool) {
        bytes32 rootHash = blocks[_tp.blockNumber].rootHash;
        bytes32 leafHash = keccak256(_tp.transition);
        return Lib_MerkleTree.verify(rootHash, leafHash, _tp.index, _tp.siblings);
    }

    /**
     * Check if the combined stateRoot of the two Merkle trees (account, strategy) matches the stateRoot.
     */
    function checkTwoTreeStateRoot(
        bytes32 _stateRoot,
        bytes32 _accountStateRoot,
        bytes32 _strategyStateRoot
    ) private pure returns (bool) {
        bytes32 newStateRoot = keccak256(abi.encodePacked(_accountStateRoot, _strategyStateRoot));
        return (_stateRoot == newStateRoot);
    }

    /**
     * Check if an account or strategy proof was indeed included.
     */
    function verifyProofInclusion(
        bytes32 _stateRoot,
        bytes32 _leafHash,
        uint256 _index,
        bytes32[] memory _siblings
    ) private pure {
        bool ok = Lib_MerkleTree.verify(_stateRoot, _leafHash, _index, _siblings);
        require(ok, "Failed proof inclusion verification check");
    }

    /**
     * Update the account and strategy Merkle trees with their new leaf nodes and check validity.
     */
    function updateAndVerify(
        bytes32 _stateRoot,
        bytes32[2] memory _leafHashes,
        dt.AccountProof memory _accountProof,
        dt.StrategyProof memory _strategyProof
    ) private pure returns (bool) {
        if (_leafHashes[0] == bytes32(0) && _leafHashes[1] == bytes32(0)) {
            return false;
        }

        // If there is an account update, compute its new Merkle tree root.
        bytes32 accountStateRoot = _accountProof.stateRoot;
        if (_leafHashes[0] != bytes32(0)) {
            accountStateRoot = Lib_MerkleTree.computeRoot(_leafHashes[0], _accountProof.index, _accountProof.siblings);
        }

        // If there is a strategy update, compute its new Merkle tree root.
        bytes32 strategyStateRoot = _strategyProof.stateRoot;
        if (_leafHashes[1] != bytes32(0)) {
            strategyStateRoot = Lib_MerkleTree.computeRoot(
                _leafHashes[1],
                _strategyProof.index,
                _strategyProof.siblings
            );
        }

        return checkTwoTreeStateRoot(_stateRoot, accountStateRoot, strategyStateRoot);
    }

    function revertBlock(uint256 _blockNumber) private {
        // pause contract
        _pause();

        // revert blocks and pending states
        while (blocks.length > _blockNumber) {
            pendingWithdrawCommits[blocks.length - 1];
            blocks.pop();
        }
        bool first;
        for (uint256 i = pendingDepositsExecuteHead; i < pendingDepositsTail; i++) {
            if (pendingDeposits[i].blockId >= _blockNumber) {
                if (!first) {
                    pendingDepositsCommitHead = i;
                    first = true;
                }
                pendingDeposits[i].blockId = _blockNumber;
                pendingDeposits[i].status = PendingDepositStatus.Pending;
            }
        }
        first = false;
        for (uint256 i = pendingBalanceSyncsExecuteHead; i < pendingBalanceSyncsTail; i++) {
            if (pendingBalanceSyncs[i].blockId >= _blockNumber) {
                if (!first) {
                    pendingBalanceSyncsCommitHead = i;
                    first = true;
                }
                pendingBalanceSyncs[i].blockId = _blockNumber;
                pendingBalanceSyncs[i].status = PendingBalanceSyncStatus.Pending;
            }
        }

        emit RollupBlockReverted(_blockNumber);
    }
}
