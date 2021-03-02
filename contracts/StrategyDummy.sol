// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./interfaces/IStrategy.sol";

/**
 * A dummy sample strategy.
 */
contract StrategyDummy is IStrategy {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    constructor() {}

    function syncCommitment(uint256, uint256) external view override {}

    function syncBalance() external pure override returns (uint256) {
        return 1e18;
    }
}
