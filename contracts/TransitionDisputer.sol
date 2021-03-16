// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import {DataTypes as dt} from "./libraries/DataTypes.sol";
import "./libraries/MerkleTree.sol";
import "./TransitionEvaluator.sol";
import "./Registry.sol";

contract TransitionDisputer {
    using SafeMath for uint256;

    TransitionEvaluator transitionEvaluator;

    constructor(TransitionEvaluator _transitionEvaluator) {
        transitionEvaluator = _transitionEvaluator;
    }

    /**
     * Tries to dispute a transition.
     *
     * @param _prevTransitionProof The inclusion proof of the transition immediately before the fraudulent transition.
     * @param _invalidTransitionProof The inclusion proof of the fraudulent transition.
     * @param _accountProof The inclusion proof of the account involved.
     * @param _strategyProof The inclusion proof of the strategy involved.
     * @param _firstBlock The block containing the previous transition.
     * @param _secondBlock The block containing the fraudulent transition.
     * @param _registry The address of the Registry contract.
     */
    function disputeTransition(
        dt.TransitionProof calldata _prevTransitionProof,
        dt.TransitionProof memory _invalidTransitionProof,
        dt.AccountProof memory _accountProof,
        dt.StrategyProof memory _strategyProof,
        dt.Block memory _firstBlock,
        dt.Block memory _secondBlock,
        Registry _registry
    ) public {
        /********* #1: CHECK_SEQUENTIAL_TRANSITIONS *********/
        // First verify that the transitions are sequential and in their respective block root hashes.
        verifySequentialTransitions(_prevTransitionProof, _invalidTransitionProof, _firstBlock, _secondBlock);

        /********* #2: DECODE_TRANSITIONS *********/
        // Decode our transitions and determine the account and strategy IDs needed to validate the transition
        (bool ok, bytes32 preStateRoot, bytes32 postStateRoot, uint32 accountId, uint32 strategyId) =
            getStateRootsAndIds(_prevTransitionProof.transition, _invalidTransitionProof.transition);
        // If not success something went wrong with the decoding...
        if (!ok) {
            // Prune the block if it has an incorrectly encoded transition!
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
                _strategyProof.value,
                _registry
            )
        );

        // Check if it was successful. If not, we've got to prune.
        if (!ok) {
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
            return;
        }

        // Woah! Looks like there's no fraud!
        revert("No fraud detected");
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
        require(success, "If the preStateRoot is invalid, then prove that invalid instead");
        (preStateRoot, , ) = abi.decode((returnData), (bytes32, uint32, uint32));

        // Now that we have the prestateRoot, let's decode the postState
        (success, returnData) = address(transitionEvaluator).call(
            abi.encodeWithSelector(TransitionEvaluator.getTransitionStateRootAndAccessList.selector, _invalidTransition)
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
    function verifySequentialTransitions(
        dt.TransitionProof memory _tp0,
        dt.TransitionProof memory _tp1,
        dt.Block memory _firstBlock,
        dt.Block memory _secondBlock
    ) private view returns (bool) {
        // Start by checking if they are in the same block
        if (_tp0.blockId == _tp1.blockId) {
            // If the blocknumber is the same, check that tp0 preceeds tp1
            require(_tp0.index + 1 == _tp1.index, "Transitions must be sequential");
            require(_tp1.index < _secondBlock.blockSize, "_tp1 outside block range");
        } else {
            // If not in the same block, check that:
            // 0) the blocks are one after another
            require(_tp0.blockId + 1 == _tp1.blockId, "Blocks must be sequential or equal");

            // 1) the index of tp0 is the last in its block
            require(_tp0.index == _firstBlock.blockSize - 1, "_tp0 must be last in its block");

            // 2) the index of tp1 is the first in its block
            require(_tp1.index == 0, "_tp1 must be first in its block");
        }

        // Verify inclusion
        require(checkTransitionInclusion(_tp0, _firstBlock), "_tp0 must be included in its block");
        require(checkTransitionInclusion(_tp1, _secondBlock), "_tp1 must be included in its block");

        return true;
    }

    /**
     * Check to see if a transition was indeed included.
     */
    function checkTransitionInclusion(dt.TransitionProof memory _tp, dt.Block memory _block)
        private
        view
        returns (bool)
    {
        bytes32 rootHash = _block.rootHash;
        bytes32 leafHash = keccak256(_tp.transition);
        return MerkleTree.verify(rootHash, leafHash, _tp.index, _tp.siblings);
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
        uint32 _index,
        bytes32[] memory _siblings
    ) private view {
        bool ok = MerkleTree.verify(_stateRoot, _leafHash, _index, _siblings);
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
    ) private view returns (bool) {
        if (_leafHashes[0] == bytes32(0) && _leafHashes[1] == bytes32(0)) {
            return false;
        }

        // If there is an account update, compute its new Merkle tree root.
        bytes32 accountStateRoot = _accountProof.stateRoot;
        if (_leafHashes[0] != bytes32(0)) {
            accountStateRoot = MerkleTree.computeRoot(_leafHashes[0], _accountProof.index, _accountProof.siblings);
        }

        // If there is a strategy update, compute its new Merkle tree root.
        bytes32 strategyStateRoot = _strategyProof.stateRoot;
        if (_leafHashes[1] != bytes32(0)) {
            strategyStateRoot = MerkleTree.computeRoot(_leafHashes[1], _strategyProof.index, _strategyProof.siblings);
        }

        return checkTwoTreeStateRoot(_stateRoot, accountStateRoot, strategyStateRoot);
    }
}
