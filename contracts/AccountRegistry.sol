// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "openzeppelin-solidity/contracts/access/Ownable.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";


contract AccountRegistry is Ownable {
    mapping(address => uint32) public registeredAccounts; // account index >= 1
    mapping(uint32 => address) public accountAddresses;
    uint32 numAccounts = 0;

    event AccountRegistered(address account, uint32 index);

    // Note: this function takes a separate signature than the deposit signature.
    // If we want to allow it to be idempotent, always called from deposit() and
    // get rid of the registerAndDeposit() API, then we would need to be OK having
    // this be a no-signature internal function, no longer callable from outside
    // our own contract code, and let deposit(), after checking its signature,
    // always call an idempotent version of registerAccount().  Opinion on how to
    // structure this code?
    function registerAccount(address _account, bytes calldata _signature)
        external returns (uint32)
    {
        require(registeredAccounts[_account] == 0, "Account already registered");
        bytes32 messageHash = keccak256(
            abi.encodePacked(address(this), "registerAccount")
        );
        bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(messageHash);
        require(
            ECDSA.recover(prefixedHash, _signature) == _account,
            "Register signature is invalid!"
        );

        numAccounts++;
        registeredAccounts[_account] = numAccounts;
        accountAddresses[numAccounts] = _account;

        emit AccountRegistered(_account, numAccounts);

        return numAccounts;
    }
}
