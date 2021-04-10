// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface IComptroller {
    /**
     * @notice Claim all the comp accrued by the holder in all markets.
     *
     * @param holder The address to claim COMP for
     */
    function claimComp(address holder) external;
}
