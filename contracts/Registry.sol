// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "openzeppelin-solidity/contracts/access/Ownable.sol";


contract Registry is Ownable {
    // Map asset addresses to indexes.
    mapping(address => uint32) public assetAddressToIndex;
    mapping(uint32 => address) public assetIndexToAddress;
    uint32 numAssets = 0;

    // Valid strategies.
    mapping(uint32 => bool) public registeredStrategies;

    event AssetRegistered(address asset, uint32 assetId);
    event StrategyRegistered(uint32 strategyId);

    function registerAsset(address _asset) external onlyOwner {
        require(_asset != address(0), "Invalid asset address");
        require(assetAddressToIndex[_asset] == 0, "Asset already registered");

        // Register asset with an index >= 1 (zero is reserved).
        numAssets++;
        assetAddressToIndex[_asset] = numAssets;
        assetIndexToAddress[numAssets] = _asset;

        emit AssetRegistered(_asset, numAssets);
    }

    function registerStrategy(uint32 _strategyId) external onlyOwner {
        require(!registeredStrategies[_strategyId], "Strategy already registered");

        registeredStrategies[_strategyId] = true;

        emit StrategyRegistered(_strategyId);
    }
}
