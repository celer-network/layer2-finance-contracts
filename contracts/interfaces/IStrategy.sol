// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

/**
 * Strategy provides abstraction for a DeFi strategy. A single type of native token can be committed to or uncommitted
 * from a strategy. Periodically, the yield
 */
interface IStrategy {
    event Committed(uint256 nativeTokenAmount, uint256 mintedStTokenAmount);

    event UnCommitted(uint256 nativeTokenAmount, uint256 burnedStTokenAmount);

    /**
     * Commit native tokens from the controller to the strategy, minting stToken.
     *
     * @param nativeTokenAmount The amount of native token to commit.
     */
    function aggregatedCommit(uint256 nativeTokenAmount) external;

    /**
     * Withdraw funds from the strategy back to the controller, burning stToken.
     *
     * @param stTokenAmount The amount of native token to commit.
     */
    function aggregatedUncommit(uint256 stTokenAmount) external;

    /**
     * Harvest the yield of the strategy and reflect it in the price of the stToken.
     */
    function updatePricePerShare() external;

    /**
     * Return the price of each share of stToken.
     *
     * @return (nativeTokenBalance / stTokenTotalSupply) * (1e18)
     */
    function getPricePerShare() external view returns (uint256);
}
