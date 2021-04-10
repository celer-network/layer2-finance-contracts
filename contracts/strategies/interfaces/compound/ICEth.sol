// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface ICEth {
    /**
     * @notice Accrue interest for `owner` and return the underlying balance.
     *
     * @param owner The address of the account to query
     * @return The amount of underlying owned by `owner`
     */
    function balanceOfUnderlying(address owner) external returns (uint256);

    /**
     * @notice Supply ETH to the market, receive cTokens in exchange.
     */
    function mint() external payable;

    /**
     * @notice Redeem cTokens in exchange for a specified amount of underlying asset.
     *
     * @param redeemAmount The amount of underlying to redeem
     * @return 0 = success, otherwise a failure
     */
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);
}
