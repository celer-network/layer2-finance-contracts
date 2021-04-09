import { expect } from 'chai';
import { deployments, ethers } from 'hardhat';

import { formatEther, parseEther } from '@ethersproject/units';
import { Wallet } from '@ethersproject/wallet';

import { loadFixture } from '../test/common';
import { ERC20__factory } from '../typechain/factories/ERC20__factory';
import { StrategyCompoundErc20LendingPool } from '../typechain/StrategyCompoundErc20LendingPool.d';

describe('StrategyCompoundDAI', function () {
  async function fixture([admin]: Wallet[]) {
    await deployments.fixture(['StrategyCompoundDAI']);

    const strategy = (await ethers.getContract('StrategyCompoundErc20LendingPool')) as StrategyCompoundErc20LendingPool;
    const daiAddress = process.env.COMPOUND_DAI;
    const dai = ERC20__factory.connect(daiAddress as string, admin);

    return { strategy, dai, admin };
  }

  it('should commit amd uncommit', async function () {
    const { strategy, dai, admin } = await loadFixture(fixture);

    expect(await strategy.getAssetAddress()).to.equal(dai.address);

    const strategyBalanceBeforeCommit = await strategy.getBalance();
    console.log('Strategy DAI balance before commit:', formatEther(strategyBalanceBeforeCommit));
    const controllerBalanceBeforeCommit = await dai.balanceOf(admin.address);
    console.log('Controller DAI balance before commit:', formatEther(controllerBalanceBeforeCommit));

    // Approve 1 DAI for controller
    const approveAmount = parseEther('1');
    const approveTx = await dai.connect(admin).approve(strategy.address, approveAmount);
    await approveTx.wait();

    console.log('===== Commit 0.001 DAI =====');
    const commitAmount = parseEther('0.001');
    const commitTx = await strategy.aggregateCommit(commitAmount);
    await commitTx.wait();

    const strategyBalanceAfterCommit = await strategy.getBalance();
    expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).gt(commitAmount)).to.be.true;
    console.log('Strategy DAI balance after commit:', formatEther(strategyBalanceAfterCommit));

    const controllerBalanceAfterCommit = await dai.balanceOf(admin.address);
    expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).eq(commitAmount)).to.be.true;
    console.log('Controller DAI balance after commit:', formatEther(controllerBalanceAfterCommit));

    console.log('===== Uncommit 0.0007 DAI =====');
    const uncommitAmount = parseEther('0.0007');
    const uncommitTx = await strategy.aggregateUncommit(uncommitAmount);
    await uncommitTx.wait();

    const strategyBalanceAfterUncommit = await strategy.getBalance();
    expect(strategyBalanceAfterUncommit.add(uncommitAmount).gt(strategyBalanceAfterCommit)).to.be.true;
    console.log('Strategy DAI balance after uncommit:', formatEther(strategyBalanceAfterUncommit));

    const controllerBalanceAfterUncommit = await dai.balanceOf(admin.address);
    expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).eq(uncommitAmount)).to.be.true;
    console.log('Controller DAI balance after uncommit:', formatEther(controllerBalanceAfterUncommit));
  });
});
