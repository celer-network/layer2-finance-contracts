// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/curve/ICurveFi.sol";
import "../interfaces/curve/IGauge.sol";
import "../interfaces/curve/IMintr.sol";
import "../interfaces/IStrategy.sol";
import "../interfaces/uniswap/IUniswapV2.sol";

/**
 * @notice Deposits stable coins into Curve 3Pool and issues stCrv3Pool<stable-coin-name> in L2. Holds eCRV (Curve 3Pool
 * LP tokens).
 */
contract StrategyCurveEthPool is IStrategy, Ownable {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    // slippage tolerance settings
    uint256 public constant DENOMINATOR = 10000;
    uint256 public slippage = 5;

    // The address of supplying token (wETH)
    uint8 public supplyTokenDecimals;
    uint8 public supplyTokenPoolIndex; // ETH - 0, sETH - 1
    
    // token addresses
    address public supplyToken; // the token the controller deposits to or withdraws from this contract
    address public eCrv; // sETH LP token
    address public crv; // CRV token
    address public weth; // WETH token

    // contract addresses
    address public sEthPool; // sETH pool contract
    address public gauge; // Curve gauge contract
    address public mintr; // Curve minter contract
    address public uniswap; // UniswapV2 contract

    address public controller;

    constructor(
        address _controller,
        address _supplyToken,
        uint8 _supplyTokenDecimals,
        uint8 _supplyTokenTriPoolIndex,
        address _triPool,
        address _eCrv,
        address _gauge,
        address _mintr,
        address _crv,
        address _weth,
        address _uniswap
    ) {
        controller = _controller;
        supplyToken = _supplyToken;
        supplyTokenDecimals = _supplyTokenDecimals;
        supplyTokenPoolIndex = _supplyTokenTriPoolIndex;
        sEthPool = _triPool;
        eCrv = _eCrv;
        gauge = _gauge;
        mintr = _mintr;
        crv = _crv;
        weth = _weth;
        uniswap = _uniswap;
    }

    /**
     * @dev Require that the caller must be an EOA account to avoid flash loans.
     */
    modifier onlyEOA() {
        require(msg.sender == tx.origin, "Not EOA");
        _;
    }

    function getAssetAddress() external view override returns (address) {
        return supplyToken;
    }

    function syncBalance() external view override returns (uint256) {
        uint256 eCrvBalance = IGauge(gauge).balanceOf(address(this));
        uint256 supplyTokenBalance =
            eCrvBalance.mul(ICurveFi(sEthPool).get_virtual_price()).div(1e18).div(10**(18 - supplyTokenDecimals));
        return supplyTokenBalance;
    }

    function harvest() external override onlyEOA {
        // Harvest CRV
        IMintr(mintr).mint(gauge);
        uint256 crvBalance = IERC20(crv).balanceOf(address(this));
        if (crvBalance > 0) {
            // Sell CRV for more supply token
            IERC20(crv).safeIncreaseAllowance(uniswap, crvBalance);

            address[] memory paths = new address[](3);
            paths[0] = crv;
            paths[1] = weth;
            paths[2] = supplyToken;

            IUniswapV2(uniswap).swapExactTokensForTokens(
                crvBalance,
                uint256(0),
                paths,
                address(this),
                block.timestamp.add(1800)
            );

            // Re-invest supply token to obtain more eCRV
            uint256 obtainedSupplyTokenAmount = IERC20(supplyToken).balanceOf(address(this));
            IERC20(supplyToken).safeIncreaseAllowance(sEthPool, obtainedSupplyTokenAmount);
            uint256 minMintAmount =
                obtainedSupplyTokenAmount.mul(1e18).mul(10**(18 - supplyTokenDecimals)).div(
                    ICurveFi(sEthPool).get_virtual_price()
                );
            uint256[2] memory amounts;
            amounts[supplyTokenPoolIndex] = obtainedSupplyTokenAmount;
            ICurveFi(sEthPool).add_liquidity(amounts, minMintAmount.mul(DENOMINATOR.sub(slippage)).div(DENOMINATOR));

            // Stake eCRV in Gauge to farm more CRV
            uint256 obtainedTriCrvBalance = IERC20(eCrv).balanceOf(address(this));
            IERC20(eCrv).safeIncreaseAllowance(gauge, obtainedTriCrvBalance);
            IGauge(gauge).deposit(obtainedTriCrvBalance);
        }
    }

    function aggregateCommit(uint256 _supplyTokenAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_supplyTokenAmount > 0, "Nothing to commit");

        // Pull supply token from Controller
        IERC20(supplyToken).safeTransferFrom(msg.sender, address(this), _supplyTokenAmount);

        // Deposit supply token to sEthPool
        IERC20(supplyToken).safeIncreaseAllowance(sEthPool, _supplyTokenAmount);
        uint256 minMintAmount =
            _supplyTokenAmount.mul(1e18).mul(10**(18 - supplyTokenDecimals)).div(ICurveFi(sEthPool).get_virtual_price());
        uint256[2] memory amounts;
        amounts[supplyTokenPoolIndex] = _supplyTokenAmount;
        ICurveFi(sEthPool).add_liquidity(amounts, minMintAmount.mul(DENOMINATOR.sub(slippage)).div(DENOMINATOR));

        // Stake eCRV in Gauge to farm CRV
        uint256 triCrvBalance = IERC20(eCrv).balanceOf(address(this));
        IERC20(eCrv).safeIncreaseAllowance(gauge, triCrvBalance);
        IGauge(gauge).deposit(triCrvBalance);

        emit Committed(_supplyTokenAmount);
    }

    function aggregateUncommit(uint256 _supplyTokenAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_supplyTokenAmount > 0, "Nothing to uncommit");

        // Unstake some sCRV from Gauge
        uint256 eCrvAmount =
            _supplyTokenAmount.mul(1e18).mul(10**(18 - supplyTokenDecimals)).div(ICurveFi(sEthPool).get_virtual_price());
        IGauge(gauge).withdraw(eCrvAmount);

        // Withdraw supply token from 3Pool
        ICurveFi(sEthPool).remove_liquidity_one_coin(
            eCrvAmount,
            supplyTokenPoolIndex,
            eCrvAmount.mul(DENOMINATOR.sub(slippage)).div(DENOMINATOR).div(10**(18 - supplyTokenDecimals))
        );

        // Transfer supply token to Controller
        uint256 supplyTokenBalance = IERC20(supplyToken).balanceOf(address(this));
        IERC20(supplyToken).safeTransfer(msg.sender, supplyTokenBalance);

        emit UnCommitted(_supplyTokenAmount);
    }

    function setController(address _controller) external onlyOwner {
        emit ControllerChanged(controller, _controller);
        controller = _controller;
    }

    function setSlippage(uint256 _slippage) external onlyOwner {
        slippage = _slippage;
    }
}
