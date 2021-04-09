// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface ICErc20 {
    /**
     * @notice Accrue interest for `owner` and return the underlying balance.
     *
     * @param owner The address of the account to query
     * @return The amount of underlying owned by `owner`
     */
    function balanceOfUnderlying(address owner) external returns (uint256);

    /**
     * @notice Supply ERC20 token to the market, receive cTokens in exchange.
     *
     * @param mintAmount The amount of the underlying asset to supply
     * @return 0 = success, otherwise a failure
     */
    function mint(uint256 mintAmount) external returns (uint256);

    /**
     * @notice Redeem cTokens in exchange for a specified amount of underlying asset.
     *
     * @param redeemAmount The amount of underlying to redeem
     * @return 0 = success, otherwise a failure
     */
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);
}
