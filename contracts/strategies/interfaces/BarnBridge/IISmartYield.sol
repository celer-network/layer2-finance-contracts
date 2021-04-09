// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface IISmartYield {
    /**
     * buy at least _minTokens with _underlyingAmount, before _deadline passes
     */
    function buyTokens(uint256 underlyingAmount_, uint256 minTokens_, uint256 deadline_) external;

    /**
     * buy an nft with tokenAmount_ jTokens, that matures at abond maturesAt
     */ 
    function buyJuniorBond(uint256 tokenAmount_, uint256 maxMaturesAt_, uint256 deadline_) external;

    /**
     * once matured, redeem a jBond for underlying
     */ 
    function redeemJuniorBond(uint256 jBondId_) external;

    /**
     * jToken price * 1e18
     */
    function price() external view returns (uint256);
}