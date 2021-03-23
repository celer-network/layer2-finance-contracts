// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/IStrategy.sol";
import "../interfaces/compound/ICEth.sol";
import "../interfaces/compound/IComptroller.sol";
import "../interfaces/uniswap/IUniswapV2.sol";
import "../../interfaces/IWETH.sol";

/**
 * Deposits ETH into Compound Lending Pool and issues stCompoundLendingETH in L2. Holds cToken (Compound interest-bearing tokens).
 */
contract StrategyCompoundEthLendingPool is IStrategy {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    // The address of Compound interst-bearing ETH
    address payable public cEth;

    // The address is used for claim COMP token
    address public comptroller;
    // The address of COMP token
    address public comp;

    address public uniswap;
    // The address of WETH token
    address public weth;

    address public controller;

    constructor(
        address payable _cEth,
        address _comptroller,
        address _comp,
        address _uniswap,
        address _weth,
        address _controller
    ) {
        cEth = _cEth;
        comptroller = _comptroller;
        comp = _comp;
        uniswap = _uniswap;
        weth = _weth;
        controller = _controller;
    }

    /**
     * @dev Return WETH address. StrategyCompoundETH contract receive WETH from controller.
     */
    function getAssetAddress() external view override returns (address) {
        return weth;
    }

    function getBalance() external override returns (uint256) {
        // ETH balance of this contract.
        // ETH balance is equal to the cETH balance multiplyed by the Exchange Rate.
        uint256 ethBalance = ICEth(cEth).balanceOfUnderlying(address(this));
        return ethBalance;
    }

    function harvest() external override {
        // Claim COMP token.
        IComptroller(comptroller).claimComp(address(this));
        uint256 compBalance = IERC20(comp).balanceOf(address(this));
        if(compBalance > 0) {
            // Sell COMP token for obtain more ETH
            IERC20(comp).safeIncreaseAllowance(uniswap, compBalance);

            address[] memory paths = new address[](2);
            paths[0] = comp;
            paths[1] = weth;

            IUniswapV2(uniswap).swapExactTokensForETH(
                compBalance,
                uint256(0),
                paths,
                address(this),
                block.timestamp.add(1800)
            );

            // Deposit ETH to Compound ETH Lending Pool and mint cETH.
            uint256 obtainedEthAmount = address(this).balance;
            ICEth(cEth).mint{value: obtainedEthAmount}();
        }
    }

    function aggregateCommit(uint256 _commitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_commitAmount > 0, "Nothing to commit");
    
        // Pull WETH from Controller
        IERC20(weth).safeTransferFrom(msg.sender, address(this), _commitAmount);
        // Convert WETH into ETH
        IWETH(weth).withdraw(_commitAmount);

        // Deposit ETH to Compound ETH Lending Pool and mint cETH.
        ICEth(cEth).mint{value: _commitAmount}();

        emit Committed(_commitAmount);
    }

    function aggregateUncommit(uint256 _uncommitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_uncommitAmount > 0, "Nothing to uncommit");

        // Withdraw ETH from Compound ETH Lending Pool based on an amount of ETH.
        uint256 redeemResult = ICEth(cEth).redeemUnderlying(_uncommitAmount);
        require(redeemResult == 0, "Couldn't redeem cToken");

        // Convert ETH into WETH
        uint256 ethBalance = address(this).balance;
        IWETH(weth).deposit{value: ethBalance}();
        // Transfer WETH to Controller
        IERC20(weth).safeTransfer(msg.sender, ethBalance);

        emit UnCommitted(_uncommitAmount);
    }

    // This is needed to receive ETH when calling `ICEth.redeemUnderlying` and `IWETH.withdraw`
    receive() external payable {}
    fallback() external payable {}
}