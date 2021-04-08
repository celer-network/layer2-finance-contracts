import { expect } from 'chai';
import { deployments, ethers } from 'hardhat';

import { formatEther, parseEther } from '@ethersproject/units';
import { Wallet } from '@ethersproject/wallet';

import { loadFixture } from '../test/common';
import { ERC20__factory } from '../typechain/factories/ERC20__factory';
import { StrategyCompoundEthLendingPool } from '../typechain/StrategyCompoundEthLendingPool.d';

describe('StrategyCompoundETH', function () {
  async function fixture([admin]: Wallet[]) {
    await deployments.fixture(['StrategyCompoundDAI']);

    const strategy = (await ethers.getContract('StrategyCompoundEthLendingPool')) as StrategyCompoundEthLendingPool;
    const wethAddress = process.env.WETH;
    const weth = ERC20__factory.connect(wethAddress as string, admin);

    return { strategy, weth, admin };
  }

  it('should commit amd uncommit', async function () {
    const { strategy, weth, admin } = await loadFixture(fixture);

    expect(await strategy.getAssetAddress()).to.equal(weth.address);

    const strategyBalanceBeforeCommit = await strategy.getBalance();
    console.log('Strategy WETH balance before commit:', formatEther(strategyBalanceBeforeCommit));
    const controllerBalanceBeforeCommit = await weth.balanceOf(admin.address);
    console.log('Controller WETH balance before commit:', formatEther(controllerBalanceBeforeCommit));

    // Approve 1 WETH for controller
    const approveAmount = parseEther('1');
    const approveTx = await weth.connect(admin).approve(strategy.address, approveAmount);
    await approveTx.wait();

    console.log('===== Commit 0.1 WETH =====');
    const commitAmount = parseEther('0.1');
    const commitTx = await strategy.aggregateCommit(commitAmount);
    await commitTx.wait();

    const strategyBalanceAfterCommit = await strategy.getBalance();
    expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).gt(parseEther('0.1'))).to.be.true;
    console.log('Strategy WETH balance after commit:', formatEther(strategyBalanceAfterCommit));

    const controllerBalanceAfterCommit = await weth.balanceOf(admin.address);
    expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).eq(parseEther('0.1'))).to.be.true;
    console.log('Controller WETH balance after commit:', formatEther(controllerBalanceAfterCommit));

    console.log('===== Uncommit 0.08 WETH =====');
    const uncommitAmount = parseEther('0.08');
    const uncommitTx = await strategy.aggregateUncommit(uncommitAmount);
    await uncommitTx.wait();

    const strategyBalanceAfterUncommit = await strategy.getBalance();
    expect(strategyBalanceAfterUncommit.add(uncommitAmount).gt(strategyBalanceAfterCommit)).to.be.true;
    console.log('Strategy WETH balance after uncommit:', formatEther(strategyBalanceAfterUncommit));

    const controllerBalanceAfterUncommit = await weth.balanceOf(admin.address);
    expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).eq(uncommitAmount)).to.be.true;
    console.log('Controller WETH balance after uncommit:', formatEther(controllerBalanceAfterUncommit));
  });
});
