// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

/**
 * @title Interface for DeFi strategies
 *
 * @notice Strategy provides abstraction for a DeFi strategy. A single type of asset token can be committed to or
 * uncommitted from a strategy per instructions from L2. Periodically, the yield is reflected in the asset balance and
 * synced back to L2.
 */
interface IStrategy {
    event Committed(uint256 commitAmount);

    event UnCommitted(uint256 uncommitAmount);

    /**
     * @dev Returns the address of the asset token.
     */
    function getAssetAddress() external view returns (address);

    /**
     * @dev Updates and returns the new asset balance.
     */
    function syncBalance() external returns (uint256);

    /**
     * @dev Commits to / uncommits from strategies per instructions from L2.
     *
     * @param commitAmount The aggregated amount to commit.
     * @param uncommitAmount The aggregated amount to uncommit.
     */
    function syncCommitment(uint256 commitAmount, uint256 uncommitAmount) external;
}
