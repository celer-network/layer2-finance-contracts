// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface IYieldFarmContinuous {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function claim() external returns (uint256);
}