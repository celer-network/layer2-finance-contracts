// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../ISmartYield.sol";
import "./YieldFarmGoverned.sol";

contract YieldFarmContinuous is YieldFarmGoverned {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 constant multiplierScale = 10 ** 18;

    IERC20 public poolToken;
    IERC20 public rewardToken;

    uint256 public rewardNotTransferred;
    uint256 public balanceBefore;
    uint256 public currentMultiplier;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public userMultiplier;
    mapping(address => uint256) public owed;

    uint256 public poolSize;

    event Claim(address indexed user, uint256 amount);
    event Deposit(address indexed user, uint256 amount, uint256 balanceAfter);
    event Withdraw(address indexed user, uint256 amount, uint256 balanceAfter);

    constructor(address _owner, address _rewardToken, address _poolToken) {
        require(_rewardToken != address(0), "reward token must not be 0x0");
        require(_poolToken != address(0), "pool token must not be 0x0");

        transferOwnership(_owner);

        rewardToken = IERC20(_rewardToken);
        poolToken = IERC20(_poolToken);
    }

    function deposit(uint256 amount) public {
        require(amount > 0, "amount must be greater than 0");

        require(
            poolToken.allowance(msg.sender, address(this)) >= amount,
            "allowance must be greater than 0"
        );

        // it is important to calculate the amount owed to the user before doing any changes
        // to the user's balance or the pool's size
        _calculateOwed(msg.sender);

        uint256 newBalance = balances[msg.sender].add(amount);
        balances[msg.sender] = newBalance;
        poolSize = poolSize.add(amount);

        poolToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposit(msg.sender, amount, newBalance);
    }

    function withdraw(uint256 amount) public {
        require(amount > 0, "amount must be greater than 0");

        uint256 currentBalance = balances[msg.sender];
        require(currentBalance >= amount, "insufficient balance");

        // it is important to calculate the amount owed to the user before doing any changes
        // to the user's balance or the pool's size
        _calculateOwed(msg.sender);

        uint256 newBalance = currentBalance.sub(amount);
        balances[msg.sender] = newBalance;
        poolSize = poolSize.sub(amount);

        poolToken.safeTransfer(msg.sender, amount);

        emit Withdraw(msg.sender, amount, newBalance);
    }

    // claim calculates the currently owed reward and transfers the funds to the user
    function claim() public returns (uint256){
        _calculateOwed(msg.sender);

        uint256 amount = owed[msg.sender];
        if (amount == 0) {
            return 0;
        }

        // check if there's enough balance to distribute the amount owed to the user
        // otherwise, pull the rewardNotTransferred from source
        if (rewardToken.balanceOf(address(this)) < amount) {
            pullRewardFromSource();
        }

        owed[msg.sender] = 0;

        rewardToken.safeTransfer(msg.sender, amount);

        // acknowledge the amount that was transferred to the user
        balanceBefore = balanceBefore.sub(amount);

        emit Claim(msg.sender, amount);

        return amount;
    }

    function withdrawAndClaim(uint256 amount) public returns (uint256) {
        withdraw(amount);
        return claim();
    }

    // ackFunds checks the difference between the last known balance of `token` and the current one
    // if it goes up, the multiplier is re-calculated
    // if it goes down, it only updates the known balance
    function ackFunds() public {
        uint256 balanceNow = rewardToken.balanceOf(address(this)).add(rewardNotTransferred);
        uint256 balanceBeforeLocal = balanceBefore;

        if (balanceNow <= balanceBeforeLocal || balanceNow == 0) {
            balanceBefore = balanceNow;
            return;
        }

        // if there's no bond staked, it doesn't make sense to ackFunds because there's nobody to distribute them to
        // and the calculation would fail anyways due to division by 0
        uint256 poolSizeLocal = poolSize;
        if (poolSizeLocal == 0) {
            return;
        }

        uint256 diff = balanceNow.sub(balanceBeforeLocal);
        uint256 multiplier = currentMultiplier.add(diff.mul(multiplierScale).div(poolSizeLocal));

        balanceBefore = balanceNow;
        currentMultiplier = multiplier;
    }

    // pullRewardFromSource transfers any amount due from the source to this contract so it can be distributed
    function pullRewardFromSource() public override {
        softPullReward();

        uint256 amountToTransfer = rewardNotTransferred;

        // if there's nothing to transfer, stop the execution
        if (amountToTransfer == 0) {
            return;
        }

        rewardNotTransferred = 0;

        rewardToken.safeTransferFrom(rewardSource, address(this), amountToTransfer);
    }

    // softPullReward calculates the reward accumulated since the last time it was called but does not actually
    // execute the transfers. Instead, it adds the amount to rewardNotTransferred variable
    function softPullReward() public {
        uint256 lastPullTs = lastSoftPullTs;

        // no need to execute multiple times in the same block
        if (lastPullTs == block.timestamp) {
            return;
        }

        uint256 rate = rewardRatePerSecond;
        address source = rewardSource;

        // don't execute if the setup was not completed
        if (rate == 0 || source == address(0)) {
            return;
        }

        // if there's no allowance left on the source contract, don't try to pull anything else
        uint256 allowance = rewardToken.allowance(source, address(this));
        if (allowance == 0 || allowance <= rewardNotTransferred) {
            return;
        }

        uint256 timeSinceLastPull = block.timestamp.sub(lastPullTs);
        uint256 amountToPull = timeSinceLastPull.mul(rate);

        // only pull the minimum between allowance left and the amount that should be pulled for the period
        uint256 allowanceLeft = allowance.sub(rewardNotTransferred);
        if (amountToPull > allowanceLeft) {
            amountToPull = allowanceLeft;
        }

        rewardNotTransferred = rewardNotTransferred.add(amountToPull);
        lastSoftPullTs = block.timestamp;
    }

    // rewardLeft returns the amount that was not yet distributed
    // even though it is not a view, this function is only intended for external use
    function rewardLeft() external returns (uint256) {
        softPullReward();

        return rewardToken.allowance(rewardSource, address(this)).sub(rewardNotTransferred);
    }

    // _calculateOwed calculates and updates the total amount that is owed to an user and updates the user's multiplier
    // to the current value
    // it automatically attempts to pull the token from the source and acknowledge the funds
    function _calculateOwed(address user) internal {
        softPullReward();
        ackFunds();

        uint256 reward = _userPendingReward(user);

        owed[user] = owed[user].add(reward);
        userMultiplier[user] = currentMultiplier;
    }

    // _userPendingReward calculates the reward that should be based on the current multiplier / anything that's not included in the `owed[user]` value
    // it does not represent the entire reward that's due to the user unless added on top of `owed[user]`
    function _userPendingReward(address user) internal view returns (uint256) {
        uint256 multiplier = currentMultiplier.sub(userMultiplier[user]);

        return balances[user].mul(multiplier).div(multiplierScale);
    }
}
