// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface IStakedAave {
    function stake(address to, uint256 amount) external;

    /**
     * @dev Redeems staked tokens, and stop earning rewards
     * @param to Address to redeem to
     * @param amount Amount to redeem
     **/
    function redeem(address to, uint256 amount) external;

    /**
     * @dev Activates the cooldown period to unstake
     * - It can't be called if the user is not staking
     **/
    function cooldown() external;

    /**
     * @dev Claims an `amount` of `REWARD_TOKEN` to the address `to`
     * @param to Address to stake for
     * @param amount Amount to stake
     **/
    function claimRewards(address to, uint256 amount) external;

    /**
     * @dev Returns the total rewards pending to claim by an staker
     * @param staker The staker address
     * @return The rewards
     */
    function getTotalRewardsBalance(address staker) external view returns (uint256);

    /**
     * @dev Returns the current cooldown start timestamp of the staker
     * @param staker The staker address
     * @return The cooldown start timestamp
     */
    function stakersCooldowns(address staker) external view returns (uint256);

    /**
     * @return The current minimum cool down time needed to elapse before a staker is able to unstake their tokens.
     */
    function COOLDOWN_SECONDS() external view returns (uint256);

    /**
     * @return The maximum window of time in seconds that a staker can redeem() their stake once a cooldown() period has
     * been completed.
     */
    function UNSTAKE_WINDOW() external view returns (uint256);
}
