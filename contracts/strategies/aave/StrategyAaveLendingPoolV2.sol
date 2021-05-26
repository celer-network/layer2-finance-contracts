// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IStrategy.sol";
import "../interfaces/aave/ILendingPool.sol";
import "../interfaces/aave/IAToken.sol";
import "../interfaces/aave/IAaveIncentivesController.sol";
import "../interfaces/aave/IStakedAave.sol";
import "../interfaces/uniswap/IUniswapV2.sol";

/**
 * Deposits ERC20 token into Aave Lending Pool and issues stAaveLendingToken(e.g. stAaveLendingDAI) in L2. Holds aToken (Aave interest-bearing tokens).
 */
contract StrategyAaveLendingPoolV2 is IStrategy, Ownable {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    // The address of Aave Lending Pool
    address public lendingPool;

    // Info of supplying erc20 token to Aave lending pool
    // The symbol of the supplying token
    string public symbol;
    // The address of supplying token (e.g. DAI, USDT)
    address public supplyToken;

    // The address of Aave interest-bearing token (e.g. aDAI, aUSDT)
    address public aToken;

    address public controller;

    // The address of Aave Incentives Controller
    address public incentivesController;

    // The address of Aave StakedAave contract
    address public stakedAave;

    // The address of AAVE token
    address public aave;

    address public uniswap;
    // The address of WETH token
    address public weth;

    constructor(
        address _lendingPool,
        string memory _symbol,
        address _supplyToken,
        address _aToken,
        address _controller,
        address _incentivesController,
        address _stakedAave,
        address _aave,
        address _uniswap,
        address _weth
    ) {
        lendingPool = _lendingPool;
        symbol = _symbol;
        supplyToken = _supplyToken;
        aToken = _aToken;
        controller = _controller;
        incentivesController = _incentivesController;
        stakedAave = _stakedAave;
        aave = _aave;
        uniswap = _uniswap;
        weth = _weth;
    }

    function getAssetAddress() external view override returns (address) {
        return supplyToken;
    }

    function syncBalance() external view override returns (uint256) {
        // Supplying token(e.g. DAI, USDT) balance of this contract.
        // aToken value is pegged to the value of supplying erc20 token at a 1:1 ratio.
        uint256 supplyTokenBalance = IAToken(aToken).balanceOf(address(this));
        return supplyTokenBalance;
    }

    function harvest() external override {
        // 1. Claims the liquidity incentives
        address[] memory assets = new address[](1);
        assets[0] = aToken;
        uint256 rewardsBalance =
            IAaveIncentivesController(incentivesController).getRewardsBalance(assets, address(this));
        if (rewardsBalance > 0) {
            IAaveIncentivesController(incentivesController).claimRewards(assets, rewardsBalance, address(this));
        }

        // 2. Activates the cooldown period if not already activated
        uint256 stakedAaveBalance = IERC20(stakedAave).balanceOf(address(this));
        if (stakedAaveBalance > 0 && IStakedAave(stakedAave).stakersCooldowns(address(this)) == 0) {
            IStakedAave(stakedAave).cooldown();
        }

        // 3. Claims the AAVE staking rewards
        uint256 stakingRewards = IStakedAave(stakedAave).getTotalRewardsBalance(address(this));
        if (stakingRewards > 0) {
            IStakedAave(stakedAave).claimRewards(address(this), stakingRewards);
        }

        // 4. Redeems staked AAVE if possible
        uint256 cooldownStartTimestamp = IStakedAave(stakedAave).stakersCooldowns(address(this));
        if (
            stakedAaveBalance > 0 &&
            block.timestamp > cooldownStartTimestamp.add(IStakedAave(stakedAave).COOLDOWN_SECONDS()) &&
            block.timestamp <=
            cooldownStartTimestamp.add(IStakedAave(stakedAave).COOLDOWN_SECONDS()).add(
                IStakedAave(stakedAave).UNSTAKE_WINDOW()
            )
        ) {
            IStakedAave(stakedAave).redeem(address(this), stakedAaveBalance);
        }

        // 5. Sells the reward AAVE token and the redeemed staked AAVE for obtain more supplying token
        uint256 aaveBalance = IERC20(aave).balanceOf(address(this));
        if (aaveBalance > 0) {
            IERC20(aave).safeIncreaseAllowance(uniswap, aaveBalance);

            address[] memory paths = new address[](3);
            paths[0] = aave;
            paths[1] = weth;
            paths[2] = supplyToken;

            IUniswapV2(uniswap).swapExactTokensForTokens(
                aaveBalance,
                uint256(0),
                paths,
                address(this),
                block.timestamp.add(1800)
            );

            // Deposit supplying token to Aave Lending Pool and mint aToken.
            uint256 obtainedSupplyTokenAmount = IERC20(supplyToken).balanceOf(address(this));
            IERC20(supplyToken).safeIncreaseAllowance(lendingPool, obtainedSupplyTokenAmount);
            ILendingPool(lendingPool).deposit(supplyToken, obtainedSupplyTokenAmount, address(this), 0);
        }
    }

    function aggregateCommit(uint256 _commitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_commitAmount > 0, "Nothing to commit");

        // Pull supplying token(e.g. DAI, USDT) from Controller
        IERC20(supplyToken).safeTransferFrom(msg.sender, address(this), _commitAmount);

        // Deposit supplying token to Aave Lending Pool and mint aToken.
        IERC20(supplyToken).safeIncreaseAllowance(lendingPool, _commitAmount);
        ILendingPool(lendingPool).deposit(supplyToken, _commitAmount, address(this), 0);

        emit Committed(_commitAmount);
    }

    function aggregateUncommit(uint256 _uncommitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_uncommitAmount > 0, "Nothing to uncommit");

        // Withdraw supplying token(e.g. DAI, USDT) from Aave Lending Pool.
        ILendingPool(lendingPool).withdraw(supplyToken, _uncommitAmount, address(this));

        // Transfer supplying token to Controller
        uint256 supplyTokenBalance = IERC20(supplyToken).balanceOf(address(this));
        IERC20(supplyToken).safeTransfer(msg.sender, supplyTokenBalance);

        emit UnCommitted(_uncommitAmount);
    }

    function setController(address _controller) external onlyOwner {
        emit ControllerChanged(controller, _controller);
        controller = _controller;
    }
}
