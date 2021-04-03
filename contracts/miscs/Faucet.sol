// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract Faucet {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /**
     * @dev Sends 0.01% of each token to the caller.
     * @param tokens The tokens to drip.
     */
    function drip(address[] calldata tokens) public {
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = IERC20(tokens[i]);
            uint256 balance = token.balanceOf(address(this));
            require(balance > 0, "Faucet is empty");
            token.safeTransfer(msg.sender, balance / 10000); // 0.01%
        }
    }
}
