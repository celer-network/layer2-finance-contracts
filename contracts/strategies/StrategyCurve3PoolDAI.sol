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
 * Deposits DAI into Curve 3Pool and issues stCrv3PoolDAI. Holds 3CRV (Curve 3Pool LP tokens).
 */
contract StrategyCurve3PoolDAI is ERC20 {
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

    // Records daiBalance / stTokenTotalSupply
    uint256 public pricePerShare = 1 * 1e18;

    event Committed(uint256 daiAmount, uint256 stAmount);
    event UnCommitted(uint256 daiAmount, uint256 stAmount);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);

    constructor(
        address _controller,
        address _dai,
        address _triPool,
        address _triCrv,
        uint256 _slippage
    )
        ERC20(
            string(abi.encodePacked("L2F Curve 3Pool ", ERC20(_dai).name())),
            string(abi.encodePacked("stCrv3Pool", ERC20(_dai).symbol()))
        )
    {
        controller = _controller;
        dai = _dai;
        triPool = _triPool;
        triCrv = _triCrv;
        slippage = _slippage;
    }

    function aggregatedCommit(uint256 _daiAmount) public {
        require(msg.sender == controller, "Not controller");
        require(_daiAmount > 0, "Nothing to commit");

        // Pull DAI from Controller
        IERC20(dai).safeTransferFrom(msg.sender, address(this), _daiAmount);
        IERC20(dai).safeApprove(triPool, 0);
        IERC20(dai).safeApprove(triPool, _daiAmount);

        // Deposit DAI to 3Pool
        uint256 vritualPrice = _daiAmount.mul(1e18).div(ICurveFi(triPool).get_virtual_price());
        ICurveFi(triPool).add_liquidity(
            [_daiAmount, 0, 0],
            vritualPrice.mul(DENOMINATOR.sub(slippage)).div(DENOMINATOR)
        );

        // Mint shares
        uint256 stAmount = _daiAmount.div(pricePerShare);
        _mint(msg.sender, stAmount);
        emit Committed(_daiAmount, stAmount);
    }

    function aggregatedUncommit(uint256 _stAmount) external {
        require(msg.sender == controller, "Not controller");
        require(_stAmount > 0, "Nothing to uncommit");

        // Withdraw DAI from 3Pool
        uint256 daiAmount = _stAmount.mul(pricePerShare);
        uint256 triCrvAmount = daiAmount.mul(1e18).div(ICurveFi(triPool).get_virtual_price());
        ICurveFi(triPool).remove_liquidity_one_coin(
            triCrvAmount,
            0,
            triCrvAmount.mul(DENOMINATOR.sub(slippage)).div(DENOMINATOR)
        );

        // Transfer DAI to Controller
        uint256 daiBalance = IERC20(dai).balanceOf(address(this));
        IERC20(dai).safeTransfer(msg.sender, daiBalance);

        // Burn shares
        _burn(msg.sender, _stAmount);
        emit UnCommitted(daiAmount, _stAmount);
    }

    function getPricePerShare() external view returns (uint256) {
        return pricePerShare;
    }

    function updatePricePerShare(uint256 _price) external {
        require(msg.sender == controller, "Not controller");

        uint256 oldPrice = pricePerShare;
        pricePerShare = _price;
        emit PriceUpdated(oldPrice, _price);
    }

    function enqueuePricePerShareUpdate() external {
        uint256 triCrvBalance = IERC20(triCrv).balanceOf(address(this));
        uint256 daiAmount = triCrvBalance.mul(ICurveFi(triPool).calc_withdraw_one_coin(triCrvBalance, 0));
        uint256 pendingPricePerShare = daiAmount.mul(1e18).div(totalSupply());
        // TODO: Enqueue price update transaction
    }
}
