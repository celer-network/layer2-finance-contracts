// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface ITransmuter {
    /**
     * @dev Withdraws staked alTokens from the transmuter
     * @param amount the amount of alTokens to unstake
     */
    function unstake(uint256 amount) external;

    /**
     * @dev Deposits alTokens into the transmuter 
     * @param amount the amount of alTokens to stake
     */
    function stake(uint256 amount) external;

    /**
     * @dev Transmutes and claims all converted base tokens.
     */
    function transmuteAndClaim() external;

    /**
     * @dev Gets the status of a user's staking position.
     *      The total amount allocated to a user is the sum of pendingdivs and inbucket.
     * @param user the address of the user you wish to query.
     * 
     * returns user status
     */
    function userInfo(address user) external view returns (uint256 depositedAl, uint256 pendingdivs, uint256 inbucket, uint256 realized);
}