// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface IAlchemist {
    /**
     * @dev Deposits collateral into a CDP.
     * @param _amount the amount of collateral to deposit.
     */
    function deposit(uint256 _amount) external;

    /**
     * @dev Attempts to withdraw part of a CDP's collateral.
     * @param _amount the amount of collateral to withdraw.
     */
    function withdraw(uint256 _amount) external returns (uint256, uint256);

    /**
     * @dev Repays debt with the native and or synthetic token.
     *      An approval is required to transfer native tokens to the transmuter.
     */
    function repay(uint256 _parentAmount, uint256 _childAmount) external;

    /**
     * @dev Mints synthetic tokens by either claiming credit or increasing the debt.
     *      Claiming credit will take priority over increasing the debt.
     * @param _amount the amount of alchemic tokens to borrow.
     */ 
    function mint(uint256 _amount) external;

    /**
     * @dev Get the total amount of collateral deposited into a CDP.
     * @param _account the user account of the CDP to query.
     * @return the deposited amount of tokens.
     */
    function getCdpTotalDeposited(address _account) external view returns (uint256);

    /**
     * @dev Get the total amount of alchemic tokens borrowed from a CDP.
     * @param _account the user account of the CDP to query.
     * @return the borrowed amount of tokens.
     */
    function getCdpTotalDebt(address _account) external view returns (uint256);
}