// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import {IERC20} from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";

import {DataTypes as dt} from "./DataTypes.sol";
import {RollupChain} from "./RollupChain.sol";
import {Registry} from "./Registry.sol";


contract DepositWithdrawManager {
    RollupChain rollupChain;
    Registry registry;

    event AssetDeposited(address account, address asset, uint256 amount, uint256 depositId);
    event AssetWithdrawn(address account, address asset, uint256 amount);

    constructor(
        address _rollupChainAddress,
        address _registryAddress
    ) public {
        rollupChain = RollupChain(_rollupChainAddress);
        registry = Registry(_registryAddress);
    }

    function deposit(
        address _asset,
        uint256 _amount
    ) public {
        require(registry.assetAddressToIndex(_asset) != 0, "Unknown asset");

        address account = msg.sender;

        require(
            IERC20(_asset).transferFrom(account, address(this), _amount),
            "Deposit failed"
        );

        // TODO: update pending deposits and send the depositId.
        uint256 depositId = 0;

        emit AssetDeposited(account, _asset, _amount, depositId);
    }

    function withdraw(
        address _account,
        address _asset,
        uint256 _amount,    // TODO: remove and determine amount from pending withdraws.
        bytes memory _signature
    ) public {
        require(registry.assetAddressToIndex(_asset) != 0, "Unknown asset");

        // TODO: verify and aggregate based on "ready" status of many pending withdraws.
        // TODO: discuss "signature" content vs reality of amounts in ready withdraws
        // TODO: delete the consumed pending withdraw entries.

        //bytes32 withdrawHash = keccak256(
        //    abi.encodePacked(
        //        address(this),
        //        "withdraw",
        //        _account,
        //        _asset,
        //        _amount,
        //        nonce
        //    )
        //);
        //bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(withdrawHash);
        //require(
        //    ECDSA.recover(prefixedHash, _signature) == _account,
        //    "Withdraw signature is invalid!"
        //);

        require(IERC20(_asset).transfer(_account, _amount), "Withdraw failed");

        emit AssetWithdrawn(_account, _asset, _amount);
    }
}
