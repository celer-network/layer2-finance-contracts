// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/IStrategy.sol";
import "../interfaces/compound/ICErc20.sol";
import "../interfaces/compound/IComptroller.sol";
import "../interfaces/uniswap/IUniswapV2.sol";

/**
 * Deposits ERC20 token into Compound Lending Pool and issues stCompoundLendingToken(e.g. stCompoundLendingDAI) in L2. Holds cToken (Compound interest-bearing tokens).
 */
contract StrategyCompoundErc20LendingPool is IStrategy {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    // Info of supplying erc20 token to Compound lending pool
    // The symbol of the supplying token
    string public symbol;
    // The address of supplying token (e.g. DAI, USDT)
    address public supplyToken;

    // The address of Compound interst-bearing token (e.g. cDAI, cUSDT)
    address public cErc20;

    // The address is used for claim COMP token
    address public comptroller;
    // The address of COMP token
    address public comp;

    address public uniswap;
    // The address of WETH token
    address public weth;

    address public controller;

    constructor(
        string memory _symbol,
        address _supplyToken,
        address _cErc20,
        address _comptroller,
        address _comp,
        address _uniswap,
        address _weth,
        address _controller
    ) {
        symbol = _symbol;
        supplyToken = _supplyToken;
        cErc20 = _cErc20;
        comptroller = _comptroller;
        comp = _comp;
        uniswap = _uniswap;
        weth = _weth;
        controller = _controller;
    }

    function getAssetAddress() external view override returns (address) {
        return supplyToken;
    }

    function getBalance() external override returns (uint256) {
        // Supplying token(e.g. DAI, USDT) balance of this contract.
        // supplyTokenBalance is equal to the cToken balance multiplyed by the Exchange Rate.
        uint256 supplyTokenBalance = ICErc20(cErc20).balanceOfUnderlying(address(this));
        return supplyTokenBalance;
    }

    function harvest() external override {
        // Claim COMP token.
        IComptroller(comptroller).claimComp(address(this));
        uint256 compBalance = IERC20(comp).balanceOf(address(this));
        if(compBalance > 0) {
            // Sell COMP token for obtain more supplying token(e.g. DAI, USDT)
            IERC20(comp).safeIncreaseAllowance(uniswap, compBalance);

            address[] memory paths = new address[](3);
            paths[0] = comp;
            paths[1] = weth;
            paths[2] = supplyToken;

            IUniswapV2(uniswap).swapExactTokensForTokens(
                compBalance,
                uint256(0),
                paths,
                address(this),
                block.timestamp.add(1800)
            );

            // Deposit supplying token to Compound Erc20 Lending Pool and mint cToken.
            uint256 obtainedSupplytokenAmount = IERC20(supplyToken).balanceOf(address(this));
            uint256 mintResult = ICErc20(cErc20).mint(obtainedSupplytokenAmount);
            require(mintResult == 0, "Couldn't mint cToken");
        }
    }

    function aggregateCommit(uint256 _commitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_commitAmount > 0, "Nothing to commit");

        // Pull supplying token(e.g. DAI, USDT) from Controller
        IERC20(supplyToken).safeTransferFrom(msg.sender, address(this), _commitAmount);

        // Deposit supplying token to Compound Erc20 Lending Pool and mint cErc20.
        IERC20(supplyToken).safeIncreaseAllowance(cErc20, _commitAmount);
        uint256 mintResult = ICErc20(cErc20).mint(_commitAmount);
        require(mintResult == 0, "Couldn't mint cToken");

        emit Committed(_commitAmount);
    }

    function aggregateUncommit(uint256 _uncommitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_uncommitAmount > 0, "Nothing to uncommit");

        // Withdraw supplying token from Compound Erc20 Lending Pool 
        // based on an amount of the supplying token(e.g. DAI, USDT).
        uint256 redeemResult = ICErc20(cErc20).redeemUnderlying(_uncommitAmount);
        require(redeemResult == 0, "Couldn't redeem cToken");

        // Transfer supplying token(e.g. DAI, USDT) to Controller
        uint256 supplyTokenBalance = IERC20(supplyToken).balanceOf(address(this));
        IERC20(supplyToken).safeTransfer(msg.sender, supplyTokenBalance);

        emit UnCommitted(_uncommitAmount);
    }   
}