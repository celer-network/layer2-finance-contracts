// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./GovTokenRegistry.sol";

import "../interfaces/IStrategy.sol";
import "../interfaces/idle/IIdleToken.sol";
import "../interfaces/aave/IStakedAave.sol";
import "../interfaces/uniswap/IUniswapV2.sol";

/**
 * Deposits ERC20 token into Idle Lending Pool V4. Holds IdleErc20(e.g. IdleDAI, IdleUSDC).
 */ 
contract StrategyIdleLendingPool is IStrategy, Ownable {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    // Governance token registry
    GovTokenRegistry govTokenRegistry;

    // The address of Idle Lending Pool(e.g. IdleDAI, IdleUSDC)
    address public iToken;
   
    // Info of supplying erc20 token to Aave lending pool
    // The symbol of the supplying token
    string public symbol;
    // The address of supplying token (e.g. DAI, USDT)
    address public supplyToken;
    // Supplying token decimals
    uint8 public decimals;
    
    // The address of Aave StakedAave contract
    address public stakedAave;

    address public weth;
    address public sushiswap;

    address public controller;

    uint256 constant public FULL_ALLOC = 100000;

    constructor(
        address _iToken,
        string memory _symbol,
        address _supplyToken,
        uint8 _decimals,
        address _govTokenRegistryAddress,
        address _stakedAave,
        address _weth,
        address _sushiswap,
        address _controller
    ) {
        iToken = _iToken;
        symbol = _symbol;
        supplyToken = _supplyToken;
        decimals = _decimals;
        govTokenRegistry = GovTokenRegistry(_govTokenRegistryAddress);
        stakedAave = _stakedAave;
        weth = _weth;
        sushiswap = _sushiswap;
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

    function harvest() external override onlyEOA {
        // Claim governance tokens without redeeming supply token
        IIdleToken(iToken).redeemIdleToken(uint256(0));

        harvestAAVE();
        swapGovTokensToSupplyToken();

        // Deposit obtained supply token to Idle Lending Pool
        uint256 obtainedSupplyTokenAmount = IERC20(supplyToken).balanceOf(address(this));
        IERC20(supplyToken).safeIncreaseAllowance(iToken, obtainedSupplyTokenAmount);
        IIdleToken(iToken).mintIdleToken(obtainedSupplyTokenAmount, false, address(0));
    }

    function syncBalance() external view override returns (uint256) {
        uint256 iTokenPrice = IIdleToken(iToken).tokenPrice();
        //uint256 iTokenPrice = getRedeemPrice();
        uint256 iTokenBalance = IERC20(iToken).balanceOf(address(this));
        uint256 supplyTokenBalance = iTokenBalance.mul(iTokenPrice).div(10**decimals).div(10**(18 - decimals));
        return supplyTokenBalance;
    }

    function aggregateCommit(uint256 _supplyTokenAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_supplyTokenAmount > 0, "Nothing to commit");

        // Pull supply token from Controller
        IERC20(supplyToken).safeTransferFrom(msg.sender, address(this), _supplyTokenAmount);

        // Deposit supply token to Idle Lending Pool
        IERC20(supplyToken).safeIncreaseAllowance(iToken, _supplyTokenAmount);
        IIdleToken(iToken).mintIdleToken(_supplyTokenAmount, false, address(0));

        emit Committed(_supplyTokenAmount);
    }

    function aggregateUncommit(uint256 _supplyTokenAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_supplyTokenAmount > 0, "Nothing to uncommit");

        // Redeem supply token amount + interests and claim governance tokens
        // When `harvest` function is called, this contract lend obtained governance token to save gas
        uint256 iTokenRedeemPrice = getRedeemPrice();
        uint256 iTokenBurnAmount = _supplyTokenAmount.mul(10**(decimals)).div(iTokenRedeemPrice).mul(10**(18 - decimals));
        IIdleToken(iToken).redeemIdleToken(iTokenBurnAmount);

        // Transfer supply token to Controller
        uint256 supplyTokenBalance = IERC20(supplyToken).balanceOf(address(this));
        IERC20(supplyToken).safeTransfer(msg.sender, supplyTokenBalance);

        emit UnCommitted(_supplyTokenAmount);
    }

    function setController(address _controller) external onlyOwner {
        emit ControllerChanged(controller, _controller);
        controller = _controller;
    }

    // Refer to IdleTokenHelper.sol (https://github.com/emilianobonassi/idle-token-helper/blob/master/IdleTokenHelper.sol)
    function getRedeemPrice() public view returns (uint256) {
        /*
         *  As per https://github.com/Idle-Labs/idle-contracts/blob/ad0f18fef670ea6a4030fe600f64ece3d3ac2202/contracts/IdleTokenGovernance.sol#L878-L900
         *
         *  Price on minting is currentPrice
         *  Price on redeem must consider the fee
         *
         *  Below the implementation of the following redeemPrice formula
         *
         *  redeemPrice := underlyingAmount/idleTokenAmount
         *
         *  redeemPrice = currentPrice * (1 - scaledFee * ΔP%)
         *
         *  where:
         *  - scaledFee   := fee/FULL_ALLOC
         *  - ΔP% := 0 when currentPrice < userAvgPrice (no gain) and (currentPrice-userAvgPrice)/currentPrice
         *
         *  n.b: gain := idleTokenAmount * ΔP% * currentPrice
         */
        uint256 userAvgPrice = IIdleToken(iToken).userAvgPrices(address(this));
        uint256 currentPrice = IIdleToken(iToken).tokenPrice();

        // When no deposits userAvgPrice is 0 equiv currentPrice
        // and in the case of 
        uint256 redeemPrice;
        if (userAvgPrice == 0 || currentPrice < userAvgPrice) {
            redeemPrice = currentPrice;
        } else {
            uint256 fee = IIdleToken(iToken).fee();

            redeemPrice = ((currentPrice.mul(FULL_ALLOC))
                .sub(
                    fee.mul(
                         currentPrice.sub(userAvgPrice)
                    )
                )).div(FULL_ALLOC);
        }

        return redeemPrice;
    }

    function harvestAAVE() internal {
        // Idle finance transfer stkAAVE to this contract
        // Activates the cooldown period if not already activated
        uint256 stakedAaveBalance = IERC20(stakedAave).balanceOf(address(this));
        if (stakedAaveBalance > 0 && IStakedAave(stakedAave).stakersCooldowns(address(this)) == 0) {
            IStakedAave(stakedAave).cooldown();
        }

        // Claims the AAVE staking rewards
        uint256 stakingRewards = IStakedAave(stakedAave).getTotalRewardsBalance(address(this));
        if (stakingRewards > 0) {
            IStakedAave(stakedAave).claimRewards(address(this), stakingRewards);
        }

        // Redeems staked AAVE if possible
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
    }

    function swapGovTokensToSupplyToken() internal {
        uint govTokenLength = govTokenRegistry.getGovTokensLength();
        address[] memory govTokens = govTokenRegistry.getGovTokens();
        for(uint32 i = 0; i < govTokenLength; i++) {
            uint256 govTokenBalance = IERC20(govTokens[i]).balanceOf(address(this));
            if (govTokenBalance > 0) {
                IERC20(govTokens[i]).safeIncreaseAllowance(sushiswap, govTokenBalance);
                if (supplyToken != weth) {
                    address[] memory paths = new address[](3);
                    paths[0] = govTokens[i];
                    paths[1] = weth;
                    paths[2] = supplyToken;

                    IUniswapV2(sushiswap).swapExactTokensForTokens(
                        govTokenBalance,
                        uint256(0),
                        paths,
                        address(this),
                        block.timestamp.add(1800)
                    );
                } else {
                    address[] memory paths = new address[](2);
                    paths[0] = govTokens[i];
                    paths[1] = weth;

                    IUniswapV2(sushiswap).swapExactTokensForTokens(
                        govTokenBalance,
                        uint256(0),
                        paths,
                        address(this),
                        block.timestamp.add(1800)
                    );
                }
            }
        }
    }
}