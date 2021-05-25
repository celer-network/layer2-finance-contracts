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
import "../../interfaces/IWETH.sol";

/**
 * @notice Deposits ETH into a Curve ETH pool and issues stTokens in L2. Holds Curve lpToken.
 */
contract StrategyCurveEth is IStrategy, Ownable {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    // slippage tolerance settings
    uint256 public constant DENOMINATOR = 10000;
    uint256 public slippage = 5;

    // supply token (WETH) params
    uint8 public ethIndexInPool = 0; // ETH - 0, Other - 1

    // token addresses
    address public lpToken; // LP token
    address public crv; // CRV token
    address public weth; // WETH token

    // contract addresses
    address public ethPool; // Curve ETH/? swap pool
    address public gauge; // Curve gauge
    address public mintr; // Curve minter
    address public uniswap; // UniswapV2

    address public controller;

    constructor(
        address _controller,
        uint8 _ethIndexInPool,
        address _ethPool,
        address _lpToken,
        address _gauge,
        address _mintr,
        address _crv,
        address _weth,
        address _uniswap
    ) {
        controller = _controller;
        ethIndexInPool = _ethIndexInPool;
        ethPool = _ethPool;
        lpToken = _lpToken;
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
        return weth;
    }

    function syncBalance() external view override returns (uint256) {
        uint256 lpTokenBalance = IGauge(gauge).balanceOf(address(this));
        uint256 supplyTokenBalance = lpTokenBalance.mul(ICurveFi(ethPool).get_virtual_price()).div(1e18);
        return supplyTokenBalance;
    }

    function harvest() external override onlyEOA {
        // Harvest CRV
        IMintr(mintr).mint(gauge);
        uint256 crvBalance = IERC20(crv).balanceOf(address(this));

        if (crvBalance > 0) {
            // Sell CRV for more supply token
            IERC20(crv).safeIncreaseAllowance(uniswap, crvBalance);

            address[] memory paths = new address[](2);
            paths[0] = crv;
            paths[1] = weth;

            IUniswapV2(uniswap).swapExactTokensForETH(
                crvBalance,
                uint256(0),
                paths,
                address(this),
                block.timestamp.add(1800)
            );

            // Re-invest supply token to obtain more lpToken
            uint256 obtainedEthAmount = address(this).balance;
            uint256 minMintAmount =
                obtainedEthAmount
                    .mul(1e18)
                    .div(ICurveFi(ethPool).get_virtual_price())
                    .mul(DENOMINATOR.sub(slippage))
                    .div(DENOMINATOR);
            uint256[2] memory amounts;
            amounts[ethIndexInPool] = obtainedEthAmount;
            ICurveFi(ethPool).add_liquidity{value: obtainedEthAmount}(amounts, minMintAmount);

            // Stake lpToken in Gauge to farm more CRV
            uint256 obtainedTriCrvBalance = IERC20(lpToken).balanceOf(address(this));
            IERC20(lpToken).safeIncreaseAllowance(gauge, obtainedTriCrvBalance);
            IGauge(gauge).deposit(obtainedTriCrvBalance);
        }
    }

    function aggregateCommit(uint256 _ethAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_ethAmount > 0, "Nothing to commit");

        // Pull WETH from Controller
        IERC20(weth).safeTransferFrom(msg.sender, address(this), _ethAmount);

        // Convert WETH into ETH
        IWETH(weth).withdraw(_ethAmount);

        // Transfer ETH to ethPool
        uint256 minMintAmount =
            _ethAmount.mul(1e18).div(ICurveFi(ethPool).get_virtual_price()).mul(DENOMINATOR.sub(slippage)).div(
                DENOMINATOR
            );
        uint256[2] memory amounts;
        amounts[ethIndexInPool] = _ethAmount;
        ICurveFi(ethPool).add_liquidity{value: _ethAmount}(amounts, minMintAmount);

        // Stake lpToken in Gauge to farm CRV
        uint256 lpTokenBalance = IERC20(lpToken).balanceOf(address(this));
        IERC20(lpToken).safeIncreaseAllowance(gauge, lpTokenBalance);
        IGauge(gauge).deposit(lpTokenBalance);

        emit Committed(_ethAmount);
    }

    function aggregateUncommit(uint256 _ethAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_ethAmount > 0, "Nothing to uncommit");

        // Unstake some lpToken from Gauge
        uint256 lpTokenAmount = _ethAmount.mul(1e18).div(ICurveFi(ethPool).get_virtual_price());
        IGauge(gauge).withdraw(lpTokenAmount);

        // Withdraw supply token from pool
        ICurveFi(ethPool).remove_liquidity_one_coin(
            lpTokenAmount,
            ethIndexInPool,
            lpTokenAmount.mul(DENOMINATOR.sub(slippage)).div(DENOMINATOR)
        );

        // Convert ETH back to WETH and transfer to the controller
        uint256 ethBalance = address(this).balance;
        IWETH(weth).deposit{value: ethBalance}();
        IERC20(weth).safeTransfer(msg.sender, ethBalance);

        emit UnCommitted(ethBalance);
    }

    function setController(address _controller) external onlyOwner {
        emit ControllerChanged(controller, _controller);
        controller = _controller;
    }

    function setSlippage(uint256 _slippage) external onlyOwner {
        slippage = _slippage;
    }

    // This is needed to receive ETH when calling `ICurveFi.remove_liquidity_one_coin` and `IWETH.withdraw`
    receive() external payable {}

    fallback() external payable {}
}
