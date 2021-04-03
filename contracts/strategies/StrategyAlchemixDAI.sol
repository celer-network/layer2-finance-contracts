// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/alchemix/IAlchemist.sol";
import "./interfaces/alchemix/ITransmuter.sol";
import "./interfaces/IStrategy.sol";

/**
 * @notice Deposits DAI into Alchemix and issues stAlDAI in L2.
 */
contract StrategyAlchemixDAI is IStrategy, Ownable {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    // The address of Alchemix vaults
    address public alchemist;
    // The address of Alchemix transmuter
    address public transmuter;
    // The address of alUSD erc20 token
    address public alUsd;

    address public dai;
    address public controller;

    constructor(
        address _alchemist,
        address _transmuter,
        address _alUsd,
        address _dai,
        address _controller
    ) {
        alchemist = _alchemist;
        transmuter = _transmuter;
        alUsd = _alUsd;
        dai = _dai;
        controller = _controller;
    }

    function getAssetAddress() external view override returns (address) {
        return dai;
    }

    function getBalance() external view override returns (uint256) {
        uint256 cdpDepositedAmount = IAlchemist(alchemist).getCdpTotalDeposited(address(this));
        
        // allocated amount by staking to Alchemix Transmuter
        ( ,uint256 peningdivs,uint256 inbucket, ) = ITransmuter(transmuter).userInfo(address(this));
        uint256 allocatedAmount = peningdivs.add(inbucket);

        return cdpDepositedAmount.add(allocatedAmount);
    }

    function harvest() external override {
        // Converts alUSD which is allocated amount by staking to DAI
        ITransmuter(transmuter).transmuteAndClaim();
        uint256 daiBalance = IERC20(dai).balanceOf(address(this));
        if (daiBalance > 0) {
            // Deposit DAI to Alchemix vaults
            IERC20(dai).safeIncreaseAllowance(alchemist, daiBalance);
            IAlchemist(alchemist).deposit(daiBalance);

            // Borrow alUSD up to 50% of DAI deposit
            uint256 cdpDepositedAmount = IAlchemist(alchemist).getCdpTotalDeposited(address(this));
            uint256 cdpDebtAmount = IAlchemist(alchemist).getCdpTotalDebt(address(this));
            uint256 alUsdBorrowAmount = cdpDepositedAmount.div(uint256(2)).sub(cdpDebtAmount);
            IAlchemist(alchemist).mint(alUsdBorrowAmount);

            // Stake alUSD to Alchemix Transmuter
            uint256 alUsdBalance = IERC20(alUsd).balanceOf(address(this));
            IERC20(alUsd).safeIncreaseAllowance(transmuter, alUsdBalance);
            ITransmuter(transmuter).stake(alUsdBalance);
        }
    }

    function aggregateCommit(uint256 _commitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_commitAmount > 0, "Nothing to commit");

        // Pull DAI from Controller
        IERC20(dai).safeTransferFrom(msg.sender, address(this), _commitAmount);

        // Deposit DAI to Alchemix vaults
        IERC20(dai).safeIncreaseAllowance(alchemist, _commitAmount);
        IAlchemist(alchemist).deposit(_commitAmount);
        
        // Borrow alUSD up to 50% of DAI deposit
        uint256 cdpDepositedAmount = IAlchemist(alchemist).getCdpTotalDeposited(address(this));
        uint256 cdpDebtAmount = IAlchemist(alchemist).getCdpTotalDebt(address(this));
        uint256 alUsdBorrowAmount = cdpDepositedAmount.div(uint256(2)).sub(cdpDebtAmount);
        IAlchemist(alchemist).mint(alUsdBorrowAmount);
        
        // Stake alUSD to Alchemix Transmuter
        uint256 alUsdBalance = IERC20(alUsd).balanceOf(address(this));
        IERC20(alUsd).safeIncreaseAllowance(transmuter, alUsdBalance);
        ITransmuter(transmuter).stake(alUsdBalance);

        emit Committed(_commitAmount);
    }

    function aggregateUncommit(uint256 _uncommitAmount) external override {
        require(msg.sender == controller, "Not controller");
        require(_uncommitAmount > 0, "Nothing to uncommit");

        // Calculate repay alUSD amount for reduce collateralisation within 200%
        uint256 cdpDepositedAmount = IAlchemist(alchemist).getCdpTotalDeposited(address(this));
        uint256 cdpDebtAmount = IAlchemist(alchemist).getCdpTotalDebt(address(this));
        uint256 alUsdRepayAmount = cdpDebtAmount.sub((cdpDepositedAmount.sub(_uncommitAmount)).div(uint256(2)));

        // Unstake alUSD from Alchemix Transmuter
        ITransmuter(transmuter).unstake(alUsdRepayAmount);
        // Repay debt with alUSD 
        IERC20(alUsd).safeIncreaseAllowance(alchemist, alUsdRepayAmount);
        IAlchemist(alchemist).repay(uint256(0), alUsdRepayAmount);
        // Withdraw DAI from Alchemix vaults.
        IAlchemist(alchemist).withdraw(_uncommitAmount);

        // Transfer DAI to Controller
        uint256 daiBalance = IERC20(dai).balanceOf(address(this));
        IERC20(dai).safeTransfer(msg.sender, daiBalance);

        emit UnCommitted(_uncommitAmount);
    }

    function setController(address _controller) external onlyOwner {
        controller = _controller;
    }
}