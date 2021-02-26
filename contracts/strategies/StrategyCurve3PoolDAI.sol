// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/curve/ICurveFi.sol";
import "../interfaces/IStrategy.sol";

/**
 * Deposits DAI into Curve 3Pool and issues stCrv3PoolDAI in L2. Holds 3CRV (Curve 3Pool LP tokens).
 */
contract StrategyCurve3PoolDAI {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    uint256 public constant DENOMINATOR = 10000;
    uint256 public slippage = 100;
    address public dai;
    address public triPool;

    // The address of the 3Pool LP token
    address public triCrv;

    address public controller;

    event Committed(uint256 commitAmount);
    event UnCommitted(uint256 uncommitAmount);

    constructor(
        address _controller,
        address _dai,
        address _triPool,
        address _triCrv,
        uint256 _slippage
    ) {
        controller = _controller;
        dai = _dai;
        triPool = _triPool;
        triCrv = _triCrv;
        slippage = _slippage;
    }

    function syncCommitment(uint256 commitAmount, uint256 uncommitAmount) external {
        require(msg.sender == controller, "Not controller");

        if (commitAmount > 0) {
            commit(commitAmount);
        }
        if (uncommitAmount > 0) {
            uncommit(uncommitAmount);
        }
    }

    function syncBalance() external view returns (uint256) {
        require(msg.sender == controller, "Not controller");

        uint256 triCrvBalance = IERC20(triCrv).balanceOf(address(this));
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

        emit Committed(_daiAmount);
    }

    function uncommit(uint256 _daiAmount) internal {
        require(_daiAmount > 0, "Nothing to uncommit");

        // Withdraw DAI from 3Pool
        uint256 triCrvAmount = _daiAmount.mul(1e18).div(ICurveFi(triPool).get_virtual_price());
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
