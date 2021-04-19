import { expect } from 'chai';
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';

import { getAddress } from '@ethersproject/address';
import { formatEther, parseEther } from '@ethersproject/units';

import { ERC20__factory } from '../typechain/factories/ERC20__factory';
import { StrategyAaveLendingPool__factory } from '../typechain/factories/StrategyAaveLendingPool__factory';
import { StrategyAaveLendingPool } from '../typechain/StrategyAaveLendingPool.d';
import { ensureBalanceAndApproval, getDeployerSigner } from './common';

dotenv.config();

describe('StrategyAaveDAI', function () {
  async function deploy() {
    const deployerSigner = await getDeployerSigner();

    let strategy: StrategyAaveLendingPool;
    const deployedAddress = process.env.STRATEGY_AAVE_DAI;
    if (deployedAddress) {
      strategy = StrategyAaveLendingPool__factory.connect(deployedAddress, deployerSigner);
    } else {
      const strategyAaveLendingPoolFactory = (await ethers.getContractFactory(
        'StrategyAaveLendingPool'
      )) as StrategyAaveLendingPool__factory;
      strategy = await strategyAaveLendingPoolFactory
        .connect(deployerSigner)
        .deploy(
          process.env.AAVE_LENDING_POOL as string,
          'DAI',
          process.env.AAVE_DAI as string,
          process.env.AAVE_ADAI as string,
          deployerSigner.address
        );
      await strategy.deployed();
    }

    const dai = ERC20__factory.connect(process.env.AAVE_DAI as string, deployerSigner);

    return { strategy, dai, deployerSigner };
  }

  it('should commit, uncommit and optionally harvest', async function () {
    this.timeout(300000);

    const { strategy, dai, deployerSigner } = await deploy();

    expect(getAddress(await strategy.getAssetAddress())).to.equal(getAddress(dai.address));

    const strategyBalanceBeforeCommit = await strategy.syncBalance();
    console.log('Strategy DAI balance before commit:', formatEther(strategyBalanceBeforeCommit));

    const commitAmount = parseEther('0.001');
    await ensureBalanceAndApproval(
      dai,
      'DAI',
      commitAmount,
      deployerSigner,
      strategy.address,
      process.env.AAVE_DAI_FUNDER as string
    );
    const controllerBalanceBeforeCommit = await dai.balanceOf(deployerSigner.address);
    console.log('Controller DAI balance before commit:', formatEther(controllerBalanceBeforeCommit));

    console.log('===== Commit 0.001 DAI =====');
    const commitGas = await strategy.estimateGas.aggregateCommit(commitAmount);
    expect(commitGas.lte(300000)).to.be.true;
    const commitTx = await strategy.aggregateCommit(commitAmount, { gasLimit: 300000 });
    await commitTx.wait();

    const strategyBalanceAfterCommit = await strategy.syncBalance();
    expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).gte(commitAmount)).to.be.true;
    console.log('Strategy DAI balance after commit:', formatEther(strategyBalanceAfterCommit));

    const controllerBalanceAfterCommit = await dai.balanceOf(deployerSigner.address);
    expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).eq(commitAmount)).to.be.true;
    console.log('Controller DAI balance after commit:', formatEther(controllerBalanceAfterCommit));

    console.log('===== Uncommit 0.0007 DAI =====');
    const uncommitAmount = parseEther('0.0007');
    const uncommitGas = await strategy.estimateGas.aggregateUncommit(uncommitAmount);
    expect(uncommitGas.lte(300000)).to.be.true;
    const uncommitTx = await strategy.aggregateUncommit(uncommitAmount, { gasLimit: 300000 });
    await uncommitTx.wait();

    const strategyBalanceAfterUncommit = await strategy.syncBalance();
    expect(strategyBalanceAfterUncommit.add(uncommitAmount).gte(strategyBalanceAfterCommit)).to.be.true;
    console.log('Strategy DAI balance after uncommit:', formatEther(strategyBalanceAfterUncommit));

    const controllerBalanceAfterUncommit = await dai.balanceOf(deployerSigner.address);
    expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).eq(uncommitAmount)).to.be.true;
    console.log('Controller DAI balance after uncommit:', formatEther(controllerBalanceAfterUncommit));

    console.log('===== Optional harvest =====');
    try {
      const harvestGas = await strategy.estimateGas.harvest();
      if (harvestGas.lte(300000)) {
        const harvestTx = await strategy.harvest({ gasLimit: 300000 });
        await harvestTx.wait();
        const strategyBalanceAfterHarvest = await strategy.callStatic.syncBalance();
        expect(strategyBalanceAfterHarvest.gte(strategyBalanceAfterUncommit)).to.be.true;
        console.log('Strategy DAI balance after harvest:', formatEther(strategyBalanceAfterHarvest));
      }
    } catch (e) {
      console.log('Cannot harvest:', e);
    }
  });
});
