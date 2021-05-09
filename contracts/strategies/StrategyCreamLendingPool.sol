// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IStrategy.sol";
import "./interfaces/compound/ICErc20.sol";
import "./interfaces/compound/IComptroller.sol";
import "./interfaces/uniswap/IUniswapV2.sol";

/**
 * Deposits ERC20 token into Cream Lending Pool and issues stCreamLendingToken(e.g. stCreamLendingDAI) in L2. Holds cToken (Cream interest-bearing tokens).
 */
contract StrategyCreamLendingPool is IStrategy, Ownable {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    // Info of supplying erc20 token to Cream lending pool
    // The symbol of the supplying token
    string public symbol;
    // The address of supplying token (e.g. DAI, USDT)
    address public supplyToken;

    // The address of Cream interest-bearing token (e.g. crDAI, crUSDT)
    address public crErc20;

    // The address is used for claim CREAM token
    address public creamtroller;
    // The address of CREAM token
    address public cream;

    address public uniswap;
    // The address of WETH token
    address public weth;

    address public controller;

    constructor(
        string memory _symbol,
        address _supplyToken,
        address _crErc20,
        address _creamtroller,
        address _cream,
        address _uniswap,
        address _weth,
        address _controller
    ) {
        symbol = _symbol;
        supplyToken = _supplyToken;
        crErc20 = _crErc20;
        creamtroller = _creamtroller;
        cream = _cream;
        uniswap = _uniswap;
        weth = _weth;
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
        // Supplying token(e.g. DAI, USDT) balance of this contract.
        // supplyTokenBalance is equal to the cToken balance multiplied by the Exchange Rate.
        uint256 supplyTokenBalance = ICErc20(crErc20).balanceOfUnderlying(address(this));
        return supplyTokenBalance;
    }

    function harvest() external override onlyEOA {
        // Claim CREAM token.
        IComptroller(creamtroller).claimComp(address(this));
        uint256 creamBalance = IERC20(cream).balanceOf(address(this));
        if (creamBalance > 0) {
            // Sell CREAM token for obtain more supplying token(e.g. DAI, USDT)
            IERC20(cream).safeIncreaseAllowance(uniswap, creamBalance);

            address[] memory paths = new address[](3);
            paths[0] = cream;
            paths[1] = weth;
            paths[2] = supplyToken;

            IUniswapV2(uniswap).swapExactTokensForTokens(
                creamBalance,
                uint256(0),
                paths,
                address(this),
                block.timestamp.add(1800)
            );

            // Deposit supplying token to Cream Erc20 Lending Pool and mint cToken.
            uint256 obtainedSupplyTokenAmount = IERC20(supplyToken).balanceOf(address(this));
            IERC20(supplyToken).safeIncreaseAllowance(crErc20, obtainedSupplyTokenAmount);
            uint256 mintResult = ICErc20(crErc20).mint(obtainedSupplyTokenAmount);
            require(mintResult == 0, "Couldn't mint crToken");
        }
    }

    function aggregateCommit(uint256 _commitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_commitAmount > 0, "Nothing to commit");

        // Pull supplying token(e.g. DAI, USDT) from Controller
        IERC20(supplyToken).safeTransferFrom(msg.sender, address(this), _commitAmount);

        // Deposit supplying token to Cream Erc20 Lending Pool and mint crErc20.
        IERC20(supplyToken).safeIncreaseAllowance(crErc20, _commitAmount);
        uint256 mintResult = ICErc20(crErc20).mint(_commitAmount);
        require(mintResult == 0, "Couldn't mint cToken");

        emit Committed(_commitAmount);
    }

    function aggregateUncommit(uint256 _uncommitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_uncommitAmount > 0, "Nothing to uncommit");

        // Withdraw supplying token from Cream Erc20 Lending Pool
        // based on an amount of the supplying token(e.g. DAI, USDT).
        uint256 redeemResult = ICErc20(crErc20).redeemUnderlying(_uncommitAmount);
        require(redeemResult == 0, "Couldn't redeem cToken");

        // Transfer supplying token(e.g. DAI, USDT) to Controller
        uint256 supplyTokenBalance = IERC20(supplyToken).balanceOf(address(this));
        IERC20(supplyToken).safeTransfer(msg.sender, supplyTokenBalance);

        emit UnCommitted(_uncommitAmount);
    }

    function setController(address _controller) external onlyOwner {
        emit ControllerChanged(controller, _controller);
        controller = _controller;
    }
}
