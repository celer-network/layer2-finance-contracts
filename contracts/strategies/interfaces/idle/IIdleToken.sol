// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface IIdleToken {
    /**
     * Get currently used gov tokens
     *
     * @return : array of govTokens supported
     */
    function getGovTokens() external view returns (address[] memory);

    /**
     * IdleToken price calculation, in underlying
     *
     * @return : price in underlying token
     */
    function tokenPrice() external view returns (uint256);

    /**
     * Used to mint IdleTokens, given an underlying amount (eg. DAI).
     * This method triggers a rebalance of the pools if _skipRebalance is set to false
     * NOTE: User should 'approve' _amount of tokens before calling mintIdleToken
     * NOTE 2: this method can be paused
     * This method use GasTokens of this contract (if present) to get a gas discount
     *
     * @param _amount : amount of underlying token to be lended
     * @param _referral : referral address
     * @return mintedTokens : amount of IdleTokens minted
     */
    function mintIdleToken(uint256 _amount, bool _skipRebalance, address _referral) external returns (uint256 mintedTokens);

    /**
      * Here we calc the pool share one can withdraw given the amount of IdleToken they want to burn
     *
     * @param _amount : amount of IdleTokens to be burned
     * @return redeemedTokens : amount of underlying tokens redeemed
     */
    function redeemIdleToken(uint256 _amount) external returns (uint256 redeemedTokens);
}