// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/BarnBridge/IISmartYield.sol";
import "./interfaces/BarnBridge/IYieldFarmContinuous.sol";
import "./dependencies/BarnBridge/SmartYield.sol";
import "./dependencies/BarnBridge/ISmartYield.sol";
import "./dependencies/BarnBridge/YieldFarm/YieldFarmContinuous.sol";

import "./interfaces/IStrategy.sol";
import "./interfaces/uniswap/IUniswapV2.sol";

/**
 * @notice Deposits USDC into Barn Bridge Smart Yield and issues stBarnBridgejcUSDC in L2.
 */
contract StrategyBarnBridgeJcUSDCYield is IStrategy, Ownable {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    // The address of BarnBridge smart yield
    address public smartYield;
    SmartYield smartYieldContract;
    // The address of compound provider pool
    address public compProviderPool;

    address public usdc;
    // The address of BarnBridge junior compound USDC
    address public jcUsdc;
    
    // The address of BarnBridge Yield Farom Continuous
    address public yieldFarm;
    YieldFarmContinuous yieldFarmContract;
    // The address of BarnBridge governance token
    address public bond;

    address public uniswap;

    address public controller;

    // NFT Id array of oending junior bond
    uint256[] public pendingJBonds;

    constructor(
        address _smartYield,
        address _yieldFarm,
        address _usdc,
        address _jcUsdc,
        address _bond,
        address _uniswap,
        address _controller
    ) {
        smartYield = _smartYield;
        smartYieldContract = SmartYield(_smartYield);
        yieldFarm = _yieldFarm;
        yieldFarmContract = YieldFarmContinuous(_yieldFarm);
        usdc = _usdc;
        jcUsdc = _jcUsdc;
        bond = _bond;
        uniswap = _uniswap;
        controller = _controller;
    }

    function getAssetAddress() external view override returns (address) {
        return usdc;
    }

    function getBalance() external override returns (uint256) {
        uint256 jcUsdcBalance = yieldFarmContract.balances(address(this));
        uint256 jcUsdcPrice = ISmartYield(smartYield).price();
        return jcUsdcBalance.mul(1e18).div(jcUsdcPrice);
    }

    function harvest() external override {
        IYieldFarmContinuous(yieldFarm).claim();
        uint256 bondBalance = IERC20(bond).balanceOf(address(this));
        if (bondBalance > 0) {
            // Sell BOND for more USDC
            IERC20(bond).safeIncreaseAllowance(uniswap, bondBalance);

            address[] memory paths = new address[](2);
            paths[0] = bond;
            paths[1] = usdc;

            IUniswapV2(uniswap).swapExactTokensForTokens(
                bondBalance,
                uint256(0),
                paths,
                address(this),
                block.timestamp.add(1800)
            );

            uint256 obtainedUsdcAmount = IERC20(usdc).balanceOf(address(this));
            IERC20(usdc).safeIncreaseAllowance(compProviderPool, obtainedUsdcAmount);
            IISmartYield(smartYield).buyTokens(
                obtainedUsdcAmount, 
                uint256(0), 
                block.timestamp.add(1800)
            );

            // Stake jcUSDC token to Yield Farm for earn BOND token
            uint256 jcUsdcBalance = IERC20(jcUsdc).balanceOf(address(this));
            IERC20(jcUsdc).safeIncreaseAllowance(yieldFarm, jcUsdcBalance);
            IYieldFarmContinuous(yieldFarm).deposit(jcUsdcBalance);
        }
    }

    function aggregateCommit(uint256 _commitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_commitAmount > 0, "Nothing to commit");

        // Pull USDC from Controller
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), _commitAmount);

        // Buy jcUSDC token
        IERC20(usdc).safeIncreaseAllowance(compProviderPool, _commitAmount);
        IISmartYield(smartYield).buyTokens(
            _commitAmount, 
            uint256(0), 
            block.timestamp.add(1800)
        );

        // Stake jcUSDC token to Yield Farm for earn BOND token
        uint256 jcUsdcBalance = IERC20(jcUsdc).balanceOf(address(this));
        IERC20(jcUsdc).safeIncreaseAllowance(yieldFarm, jcUsdcBalance);
        IYieldFarmContinuous(yieldFarm).deposit(jcUsdcBalance);

        emit Committed(_commitAmount);
    }

    function aggregateUncommit(uint256 _uncommitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_uncommitAmount > 0, "Nothing to uncommit");

        // Unstake jcUSDC token from Yield Farm
        uint256 jcUsdcPrice = ISmartYield(smartYield).price();
        uint256 jcUsdcWithdrawAmount = _uncommitAmount.mul(1e18).div(jcUsdcPrice);
        IYieldFarmContinuous(yieldFarm).withdraw(jcUsdcWithdrawAmount);

        // Buy Junior bond
        // maxMaturesAt param refer to barnbridge two-step-withdraw frontend (https://github.com/BarnBridge/barnbridge-frontend/blob/8aabd18a5d2ac35bbfb250b8d5a40bb2a8a86620/src/modules/smart-yield/views/withdraw-view/two-step-withdraw/index.tsx)
        IERC20(jcUsdc).safeIncreaseAllowance(smartYield, jcUsdcWithdrawAmount);
        ( , , ,uint256 maturesAt, ) = smartYieldContract.abond();
        uint256 maxMaturesAt = maturesAt.div(1e18).add(1);
        IISmartYield(smartYield).buyJuniorBond(
            jcUsdcWithdrawAmount,
            maxMaturesAt,
            block.timestamp.add(1800)
        );

        // NFT Id of junior bond
        uint256 juniorBondId = smartYieldContract.juniorBondId();   
        pendingJBonds.push(juniorBondId);

        emit UnCommitted(_uncommitAmount);
    }

    function redeemJuniorBond() external {
        require(pendingJBonds.length >= 1, "pending junior BOND does not exist");
        uint arrayLength = pendingJBonds.length;
        for(uint i = 0; i < arrayLength; i++) {
            uint256 juniorBondId = pendingJBonds[i];
            ( ,uint256 maturesAt) = smartYieldContract.juniorBonds(juniorBondId);
            if (maturesAt <= block.timestamp) {
                ISmartYield(smartYield).redeemJuniorBond(juniorBondId);
                pendingJBonds[i] = pendingJBonds[arrayLength - 1];
                delete pendingJBonds[arrayLength - 1];
                arrayLength--;
            }
        }

        uint256 usdcBalance = IERC20(usdc).balanceOf(address(this));
        IERC20(usdc).safeTransfer(msg.sender, usdcBalance);
    }

    function setController(address _controller) external onlyOwner {
        controller = _controller;
    }
}