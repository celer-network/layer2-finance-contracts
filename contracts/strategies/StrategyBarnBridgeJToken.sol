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
import "./dependencies/BarnBridge/YieldFarm/YieldFarmContinuous.sol";

import "./interfaces/IStrategy.sol";
import "./interfaces/uniswap/IUniswapV2.sol";

/**
 * @notice Deposits ERC20 token into Barn Bridge Smart Yield and issues stBarnBridgeJToken(e.g. stBarnBridgeJcUSDC) in L2.
 */
contract StrategyBarnBridgeJToken is IStrategy, Ownable {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    // The address of BarnBridge smart yield
    address public smartYield;
    SmartYield smartYieldContract;
    // The address of compound provider pool
    address public compProviderPool;

    // Info of supplying erc20 token to Smart Yield
    // The symbol of the supplying token
    string public symbol;
    // The address of supplying token(e.g. USDC, DAI)
    address public supplyToken;

    // The address of junior token(e.g. bb_cUSDC, bb_cDAI)
    // This address is the same as the smartYield address
    address public jToken;
    
    // The address of BarnBridge Yield Farom Continuous
    address public yieldFarm;
    YieldFarmContinuous yieldFarmContract;
    // The address of BarnBridge governance token
    address public bond;

    address public uniswap;

    address public controller;

    // NFT Id array of pending junior bond
    uint256[] public pendingJBonds;

    constructor(
        address _smartYield,
        address _compProviderPool,
        string memory _symbol,
        address _yieldFarm,
        address _supplyToken,
        address _bond,
        address _uniswap,
        address _controller
    ) {
        smartYield = _smartYield;
        smartYieldContract = SmartYield(_smartYield);
        compProviderPool = _compProviderPool;
        symbol = _symbol;
        supplyToken = _supplyToken;
        jToken = _smartYield;
        yieldFarm = _yieldFarm;
        yieldFarmContract = YieldFarmContinuous(_yieldFarm);
        bond = _bond;
        uniswap = _uniswap;
        controller = _controller;
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

    function syncBalance() external override returns (uint256) {
        uint256 jTokenBalance = yieldFarmContract.balances(address(this));
        // Calculate share of jTokenBalance in the debt
        uint256 forfeits = calForfeits(jTokenBalance);
        // jTokenPrice is jToken price * 1e18
        uint256 jTokenPrice = IISmartYield(smartYield).price();
        return jTokenBalance.mul(jTokenPrice).div(1e18).sub(forfeits);
    }

    function calForfeits(uint256 jTokenAmount) public view returns (uint256) {
        // share of jTokenAmount in the debt
        uint256 debtShare = jTokenAmount.mul(1e18).div(IERC20(jToken).totalSupply());
        uint256 forfeits = IISmartYield(smartYield).abondDebt().mul(debtShare).div(1e18);
        return forfeits;
    }

    function harvest() external override onlyEOA {
        IYieldFarmContinuous(yieldFarm).claim();
        uint256 bondBalance = IERC20(bond).balanceOf(address(this));
        if (bondBalance > 0) {
            // Sell BOND for more supplying token(e.g. USDC, DAI)
            IERC20(bond).safeIncreaseAllowance(uniswap, bondBalance);

            address[] memory paths = new address[](2);
            paths[0] = bond;
            paths[1] = supplyToken;

            IUniswapV2(uniswap).swapExactTokensForTokens(
                bondBalance,
                uint256(0),
                paths,
                address(this),
                block.timestamp.add(1800)
            );

            uint256 obtainedSupplyTokenAmount = IERC20(supplyToken).balanceOf(address(this));
            IERC20(supplyToken).safeIncreaseAllowance(compProviderPool, obtainedSupplyTokenAmount);
            IISmartYield(smartYield).buyTokens(
                obtainedSupplyTokenAmount, 
                uint256(0), 
                block.timestamp.add(1800)
            );

            // Stake junior token(e.g. bb_cUSDC, bb_cDAI) to Yield Farm for earn BOND token
            uint256 jTokenBalance = IERC20(jToken).balanceOf(address(this));
            IERC20(jToken).safeIncreaseAllowance(yieldFarm, jTokenBalance);
            IYieldFarmContinuous(yieldFarm).deposit(jTokenBalance);
        }
    }

    function aggregateCommit(uint256 _commitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_commitAmount > 0, "Nothing to commit");

        // Pull supplying token(e.g. USDC, DAI) from Controller
        IERC20(supplyToken).safeTransferFrom(msg.sender, address(this), _commitAmount);

        // Buy junior token(e.g. bb_cUSDC, bb_cDAI)
        IERC20(supplyToken).safeIncreaseAllowance(compProviderPool, _commitAmount);
        IISmartYield(smartYield).buyTokens(
            _commitAmount, 
            uint256(0), 
            block.timestamp.add(1800)
        );

        // Stake junior token to Yield Farm for earn BOND token
        uint256 jTokenBalance = IERC20(jToken).balanceOf(address(this));
        IERC20(jToken).safeIncreaseAllowance(yieldFarm, jTokenBalance);
        IYieldFarmContinuous(yieldFarm).deposit(jTokenBalance);

        emit Committed(_commitAmount);
    }

    function aggregateUncommit(uint256 _uncommitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_uncommitAmount > 0, "Nothing to uncommit");

        // Unstake junior token(e.g. bb_cUSDC, bb_cDAI) from Yield Farm
        // jTokenPrice is junior token price * 1e18
        uint256 jTokenPrice = ISmartYield(smartYield).price();
        uint256 jTokenWithdrawAmount = _uncommitAmount.mul(1e18).div(jTokenPrice);
        IYieldFarmContinuous(yieldFarm).withdraw(jTokenWithdrawAmount);

        // Instant withdraw
        IISmartYield(smartYield).sellTokens(
            jTokenWithdrawAmount,
            uint256(0),
            block.timestamp.add(1800)
        );

        // Transfer supply token to Controller
        uint256 supplyTokenBalance = IERC20(supplyToken).balanceOf(address(this));
        IERC20(supplyToken).safeTransfer(controller, supplyTokenBalance);
        
        emit UnCommitted(_uncommitAmount);
    }

    function setController(address _controller) external onlyOwner {
        emit ControllerChanged(controller, _controller);
        controller = _controller;
    }
}