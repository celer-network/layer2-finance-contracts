// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface IISmartYield {
    /**
     * buy at least _minTokens with _underlyingAmount, before _deadline passes
     */
    function buyTokens(uint256 underlyingAmount_, uint256 minTokens_, uint256 deadline_) external;

    /**
     * sell _tokens for at least _minUnderlying, before _deadline and forfeit potential future gains
     */
    function sellTokens(uint256 tokenAmount_, uint256 minUnderlying_, uint256 deadline_) external;

    /**
     * jToken price * 1e18
     */
    function price() external returns (uint256);

    function abondDebt() external view returns (uint256);
}