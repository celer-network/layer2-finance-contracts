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
    address asset;

    constructor(address _controller, address _asset) {
        controller = _controller;
        asset = _asset;
    }

    function getAssetAddress() external view override returns (address) {
        return asset;
    }

    function syncCommitment(uint256 _commitAmount, uint256 _uncommitAmount) external override {
        if (_commitAmount > 0) {
            IERC20(asset).safeTransferFrom(controller, address(this), _commitAmount);
        }
        if (_uncommitAmount > 0) {
            IERC20(asset).safeTransfer(controller, _uncommitAmount);
        }
    }

    function syncBalance() external view override returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }
}
