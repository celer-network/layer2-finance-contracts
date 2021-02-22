// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "openzeppelin-solidity/contracts/access/Ownable.sol";


contract TokenRegistry is Ownable {
    mapping(address => uint32) public tokenAddressToTokenIndex;
    mapping(uint32 => address) public tokenIndexToTokenAddress;
    uint32 numTokens = 0;

    event TokenRegistered(
        address indexed tokenAddress,
        uint32 indexed tokenIndex
    );

    function registerToken(address _tokenAddress) external onlyOwner {
        // Register token with an index if it isn't already
        // Note: this means index value 0 cannot be used, start at 1.
        if (
            _tokenAddress != address(0) &&
            tokenAddressToTokenIndex[_tokenAddress] == 0
        ) {
            numTokens++;
            tokenAddressToTokenIndex[_tokenAddress] = numTokens;
            tokenIndexToTokenAddress[numTokens] = _tokenAddress;
            emit TokenRegistered(_tokenAddress, numTokens);
        }
    }
}
