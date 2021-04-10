// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IStrategy.sol";
import "./interfaces/aave/ILendingPool.sol";
import "./interfaces/aave/IAToken.sol";

/**
 * Deposits ERC20 token into Aave Lending Pool and issues stAaveLendingToken(e.g. stAaveLendingDAI) in L2. Holds aToken (Aave interest-bearing tokens).
 */
contract StrategyAaveLendingPool is IStrategy, Ownable {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    // The address of Aave Lending Pool
    address public lendingPool;

    // Info of supplying erc20 token to Aave lending pool
    // The symbol of the supplying token
    string public symbol;
    // The address of supplying token (e.g. DAI, USDT)
    address public supplyToken;

    // The address of Aave interest-bearing token (e.g. aDAI, aUSDT)
    address public aToken;

    address public controller;

    constructor(
        address _lendingPool,
        string memory _symbol,
        address _supplyToken,
        address _aToken,
        address _controller
    ) {
        lendingPool = _lendingPool;
        symbol = _symbol;
        supplyToken = _supplyToken;
        aToken = _aToken;
        controller = _controller;
    }

    function getAssetAddress() external view override returns (address) {
        return supplyToken;
    }

    function syncBalance() external view override returns (uint256) {
        // Supplying token(e.g. DAI, USDT) balance of this contract.
        // aToken value is pegged to the value of supplying erc20 token at a 1:1 ratio.
        uint256 supplyTokenBalance = IAToken(aToken).balanceOf(address(this));
        return supplyTokenBalance;
    }

    // Currently Aave protocol does not support LP Rewards and Staking.
    function harvest() external override {}

    function aggregateCommit(uint256 _commitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_commitAmount > 0, "Nothing to commit");

        // Pull supplying token(e.g. DAI, USDT) from Controller
        IERC20(supplyToken).safeTransferFrom(msg.sender, address(this), _commitAmount);

        // Deposit supplying token to Aave Lending Pool and mint aToken.
        IERC20(supplyToken).safeIncreaseAllowance(lendingPool, _commitAmount);
        ILendingPool(lendingPool).deposit(supplyToken, _commitAmount, address(this), 0);

        emit Committed(_commitAmount);
    }

    function aggregateUncommit(uint256 _uncommitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_uncommitAmount > 0, "Nothing to uncommit");

        // Withdraw supplying token(e.g. DAI, USDT) from Aave Lending Pool.
        ILendingPool(lendingPool).withdraw(supplyToken, _uncommitAmount, address(this));

        // Transfer supplying token to Controller
        uint256 supplyTokenBalance = IERC20(supplyToken).balanceOf(address(this));
        IERC20(supplyToken).safeTransfer(msg.sender, supplyTokenBalance);

        emit UnCommitted(_uncommitAmount);
    }

    function setController(address _controller) external onlyOwner {
        controller = _controller;
    }
}
