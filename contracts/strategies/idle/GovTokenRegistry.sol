// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract GovTokenRegistry is Ownable {
    // Array of governance token addresses 
    // Governance tokens are ditributed by Idle finance
    address[] public govTokens;

    event GovTokenRegistered(address govTokenAddress);
    event GovTokenUnregistered(address govTokenAddress);

    constructor(
        address _comp,
        address _idle,
        address _aave
    ){
        govTokens.push(_comp);
        govTokens.push(_idle);
        govTokens.push(_aave);
    }

    function getGovTokens() public view returns (address[] memory) {
        return govTokens;
    }

    function getGovTokensLength() public view returns (uint) {
        return govTokens.length;
    }

    /**
     * @notice Register a governance token which can swap on sushiswap
     * @param _govToken The governance token address
     */
    function registerGovToken(address _govToken) external onlyOwner {
        require(_govToken != address(0), "Invalid governance token");
        govTokens.push(_govToken);

        emit GovTokenRegistered(_govToken);
    }

    /**
     * @notice Unregister a govenance token when Idle finance does not support token
     * @param _govToken The governance token address
     */
    function unregisterGovToken(address _govToken) external onlyOwner {
        require(_govToken != address(0), "Invalid governance token");
        for (uint i = 0; i < govTokens.length; i++) {
            if (govTokens[i] == _govToken) {
                govTokens[i] = govTokens[govTokens.length-1];
                delete govTokens[govTokens.length-1];
                
                emit GovTokenUnregistered(_govToken);
            }
        }
    }
}