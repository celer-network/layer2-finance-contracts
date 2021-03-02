// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./interfaces/curve/ICurveFi.sol";
import "./interfaces/curve/IGauge.sol";
import "./interfaces/curve/IMintr.sol";
import "./interfaces/IStrategy.sol";
import "./interfaces/uniswap/IUniswapV2.sol";

/**
 * Deposits DAI into Curve 3Pool and issues stCrv3PoolDAI in L2. Holds 3CRV (Curve 3Pool LP tokens).
 */
contract StrategyCurve3PoolDAI is IStrategy {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    uint256 public constant DENOMINATOR = 10000;
    uint256 public slippage = 100;
    address public triPool;

    address public dai;
    // The address of the 3Pool LP token
    address public triCrv;
    address public gauge;
    address public mintr;
    address public crv;
    address public weth;
    address public uniswap;

    address public controller;

    constructor(
        address _controller,
        address _dai,
        address _triPool,
        address _triCrv,
        address _gauge,
        address _mintr,
        address _crv,
        address _weth,
        address _uniswap,
        uint256 _slippage
    ) {
        controller = _controller;
        dai = _dai;
        triPool = _triPool;
        triCrv = _triCrv;
        gauge = _gauge;
        mintr = _mintr;
        crv = _crv;
        weth = _weth;
        uniswap = _uniswap;
        slippage = _slippage;
    }

    function syncCommitment(uint256 commitAmount, uint256 uncommitAmount) external override {
        require(msg.sender == controller, "Not controller");

        if (commitAmount > 0) {
            commit(commitAmount);
        }
        if (uncommitAmount > 0) {
            uncommit(uncommitAmount);
        }
    }

    function syncBalance() external override returns (uint256) {
        require(msg.sender == controller, "Not controller");

        // Harvest CRV
        IMintr(mintr).mint(gauge);
        uint256 crvBalance = IERC20(crv).balanceOf(address(this));
        if (crvBalance > 0) {
            // Sell CRV for more DAI
            IERC20(crv).safeApprove(uniswap, 0);
            IERC20(crv).safeApprove(uniswap, crvBalance);

            address[] memory paths = new address[](3);
            paths[0] = crv;
            paths[1] = weth;
            paths[2] = dai;

            IUniswapV2(uniswap).swapExactTokensForTokens(
                crvBalance,
                uint256(0),
                paths,
                address(this),
                block.timestamp.add(1800)
            );

            // Re-invest DAI to obtain more 3CRV
            uint256 obtainedDaiAmount = IERC20(dai).balanceOf(address(this));
            uint256 virtualPrice = obtainedDaiAmount.mul(1e18).div(ICurveFi(triPool).get_virtual_price());
            ICurveFi(triPool).add_liquidity(
                [obtainedDaiAmount, 0, 0],
                virtualPrice.mul(DENOMINATOR.sub(slippage)).div(DENOMINATOR)
            );

            // Stake 3CRV in Gauge to farm more CRV
            uint256 obtainedTriCrvBalance = IERC20(triCrv).balanceOf(address(this));
            IGauge(gauge).deposit(obtainedTriCrvBalance);
        }

        uint256 triCrvBalance = IGauge(gauge).balanceOf(address(this));
        uint256 daiBalance = triCrvBalance.mul(ICurveFi(triPool).calc_withdraw_one_coin(triCrvBalance, 0));
        return daiBalance;
    }

    function commit(uint256 _daiAmount) internal {
        require(_daiAmount > 0, "Nothing to commit");

        // Pull DAI from Controller
        IERC20(dai).safeTransferFrom(msg.sender, address(this), _daiAmount);

        // Deposit DAI to 3Pool
        IERC20(dai).safeApprove(triPool, 0);
        IERC20(dai).safeApprove(triPool, _daiAmount);
        uint256 virtualPrice = _daiAmount.mul(1e18).div(ICurveFi(triPool).get_virtual_price());
        ICurveFi(triPool).add_liquidity(
            [_daiAmount, 0, 0],
            virtualPrice.mul(DENOMINATOR.sub(slippage)).div(DENOMINATOR)
        );

        // Stake 3CRV in Gauge to farm CRV
        uint256 triCrvBalance = IERC20(triCrv).balanceOf(address(this));
        IGauge(gauge).deposit(triCrvBalance);

        emit Committed(_daiAmount);
    }

    function uncommit(uint256 _daiAmount) internal {
        require(_daiAmount > 0, "Nothing to uncommit");

        // Unstake some 3CRV from Gauge
        uint256 triCrvAmount = _daiAmount.mul(1e18).div(ICurveFi(triPool).get_virtual_price());
        IGauge(gauge).withdraw(triCrvAmount);

        // Withdraw DAI from 3Pool
        ICurveFi(triPool).remove_liquidity_one_coin(
            triCrvAmount,
            0,
            triCrvAmount.mul(DENOMINATOR.sub(slippage)).div(DENOMINATOR)
        );

        // Transfer DAI to Controller
        uint256 daiBalance = IERC20(dai).balanceOf(address(this));
        IERC20(dai).safeTransfer(msg.sender, daiBalance);

        emit UnCommitted(_daiAmount);
    }
}
