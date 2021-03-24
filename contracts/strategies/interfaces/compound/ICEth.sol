// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface ICEth {
    /**
     * @notice Get the underlying balance of the `owner`
     * @param owner The address of the account to query
     * @return The amount of underlying owned by `owner`
     */
    function balanceOfUnderlying(address owner) external returns (uint256);

    /**
     * @notice Sender supplies assets into the market and receives cTokens in exchange
     */
    function mint() external payable;

    /**
     * @notice Sender redeems cTokens in exchange for a specified amount fo underlying asset
     * @param redeemAmount The amount of underlying to redeem
     * @return uint 0=success, otherwise a failure
     */
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);
}
