// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./interfaces/IStrategy.sol";

/**
 * @notice A dummy sample strategy that does nothing with the committed funds.
 */
contract StrategyDummy is IStrategy {
    using Address for address;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address controller;
    address funder;
    address asset;

    constructor(
        address _controller,
        address _funder,
        address _asset
    ) {
        controller = _controller;
        funder = _funder;
        asset = _asset;
    }

    function getAssetAddress() external view override returns (address) {
        return asset;
    }

    function aggregateCommit(uint256 _commitAmount) external payable override {
        require(msg.sender == controller, "Not controller");
        require(_commitAmount > 0, "Nothing to commit");
        IERC20(asset).safeTransferFrom(controller, address(this), _commitAmount);
    }

    function aggregateUncommit(uint256 _uncommitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_uncommitAmount > 0, "Nothing to uncommit");
        IERC20(asset).safeTransfer(controller, _uncommitAmount);
    }

    function getBalance() external view override returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    function updateBalance() external override {
        IERC20(asset).safeTransferFrom(funder, address(this), 1e18);
    }
}
