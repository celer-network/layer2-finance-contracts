// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IStrategy.sol";

/**
 * @notice A dummy sample strategy that does nothing with the committed funds.
 * @dev Use ownable to have better control on testnet.
 */
contract StrategyDummy is IStrategy, Ownable {
    using Address for address;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address controller;
    address asset;

    address funder;
    uint256 harvestGain;

    constructor(
        address _controller,
        address _asset,
        address _funder,
        uint256 _harvestGain
    ) {
        controller = _controller;
        funder = _funder;
        asset = _asset;
        harvestGain = _harvestGain;
    }

    function getAssetAddress() external view override returns (address) {
        return asset;
    }

    function aggregateCommit(uint256 _commitAmount) external override {
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

    function harvest() external override onlyOwner {
        IERC20(asset).safeTransferFrom(funder, address(this), harvestGain);
    }

    function setHarvestGain(uint256 _harvestGain) external onlyOwner {
        harvestGain = _harvestGain;
    }
}