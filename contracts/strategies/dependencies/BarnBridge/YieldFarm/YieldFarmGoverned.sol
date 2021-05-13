// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract YieldFarmGoverned is Ownable {
    address public rewardSource;
    uint256 public rewardRatePerSecond;

    uint256 public lastSoftPullTs;

    function setRewardsSource(address src) public {
        require(msg.sender == owner(), "only owner can call");
        require(src != address(0), "source cannot be 0x0");

        rewardSource = src;
    }

    function setRewardRatePerSecond(uint256 rate) public {
        require(msg.sender == owner(), "only owner can call");

        // pull everything due until now to not be affected by the change in rate
        pullRewardFromSource();

        rewardRatePerSecond = rate;

        // it's the first time the rate is set which is equivalent to starting the rewards
        if (lastSoftPullTs == 0) {
            lastSoftPullTs = block.timestamp;
        }
    }

    function pullRewardFromSource() public virtual;
}