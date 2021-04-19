import { expect } from 'chai';
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';

import { getAddress } from '@ethersproject/address';
import { formatEther, parseEther } from '@ethersproject/units';

import { ERC20__factory } from '../typechain/factories/ERC20__factory';
import { StrategyCurve3Pool__factory } from '../typechain/factories/StrategyCurve3Pool__factory';
import { StrategyCurve3Pool } from '../typechain/StrategyCurve3Pool';
import { ensureBalanceAndApproval, getDeployerSigner } from './common';

dotenv.config();

describe('StrategyCurve3PoolDAI', function () {
  async function deploy() {
    const deployerSigner = await getDeployerSigner();

    let strategy: StrategyCurve3Pool;
    const deployedAddress = process.env.STRATEGY_CURVE_3POOL_DAI;
    if (deployedAddress) {
      strategy = StrategyCurve3Pool__factory.connect(deployedAddress, deployerSigner);
    } else {
      const strategyCurve3PoolFactory = (await ethers.getContractFactory(
        'StrategyCurve3Pool'
      )) as StrategyCurve3Pool__factory;
      strategy = await strategyCurve3PoolFactory
        .connect(deployerSigner)
        .deploy(
          deployerSigner.address,
          process.env.CURVE_DAI as string,
          18,
          0,
          process.env.CURVE_3POOL as string,
          process.env.CURVE_3POOL_3CRV as string,
          process.env.CURVE_3POOL_GAUGE as string,
          process.env.CURVE_3POOL_MINTR as string,
          process.env.CURVE_CRV as string,
          process.env.WETH as string,
          process.env.UNISWAP_ROUTER as string
        );
      await strategy.deployed();
    }

    const dai = ERC20__factory.connect(process.env.CURVE_DAI as string, deployerSigner);

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
      process.env.CURVE_DAI_FUNDER as string
    );
    const controllerBalanceBeforeCommit = await dai.balanceOf(deployerSigner.address);
    console.log('Controller DAI balance before commit:', formatEther(controllerBalanceBeforeCommit));

    console.log('===== Commit 0.001 DAI =====');
    const slippageAmount = parseEther('0.0003');
    const commitGas = await strategy.estimateGas.aggregateCommit(commitAmount);
    expect(commitGas.lte(1000000)).to.be.true;
    const commitTx = await strategy.aggregateCommit(commitAmount, { gasLimit: 1000000 });
    await commitTx.wait();

    const strategyBalanceAfterCommit = await strategy.syncBalance();
    expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).add(slippageAmount).gte(commitAmount)).to.be
      .true;
    expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).sub(slippageAmount).lte(commitAmount)).to.be
      .true;
    console.log('Strategy DAI balance after commit:', formatEther(strategyBalanceAfterCommit));

    const controllerBalanceAfterCommit = await dai.balanceOf(deployerSigner.address);
    expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).add(slippageAmount).gte(commitAmount)).to.be
      .true;
    expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).sub(slippageAmount).lte(commitAmount)).to.be
      .true;
    console.log('Controller DAI balance after commit:', formatEther(controllerBalanceAfterCommit));

    console.log('===== Uncommit 0.0007 DAI =====');
    const uncommitAmount = parseEther('0.0007');
    const uncommitGas = await strategy.estimateGas.aggregateUncommit(uncommitAmount);
    expect(uncommitGas.lte(1000000)).to.be.true;
    const uncommitTx = await strategy.aggregateUncommit(uncommitAmount, { gasLimit: 1000000 });
    await uncommitTx.wait();

    const strategyBalanceAfterUncommit = await strategy.syncBalance();
    expect(strategyBalanceAfterUncommit.add(uncommitAmount).add(slippageAmount).gte(strategyBalanceAfterCommit)).to.be
      .true;
    expect(strategyBalanceAfterUncommit.add(uncommitAmount).sub(slippageAmount).lte(strategyBalanceAfterCommit)).to.be
      .true;
    console.log('Strategy DAI balance after uncommit:', formatEther(strategyBalanceAfterUncommit));

    const controllerBalanceAfterUncommit = await dai.balanceOf(deployerSigner.address);
    expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).add(slippageAmount).gte(uncommitAmount)).to
      .be.true;
    expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).sub(slippageAmount).lte(uncommitAmount)).to
      .be.true;
    console.log('Controller DAI balance after uncommit:', formatEther(controllerBalanceAfterUncommit));

    console.log('===== Optional harvest =====');
    try {
      // Send some CRV to the strategy
      const crv = ERC20__factory.connect(process.env.CURVE_CRV as string, deployerSigner);
      await (
        await crv
          .connect(await ethers.getSigner(process.env.CURVE_CRV_FUNDER as string))
          .transfer(strategy.address, parseEther('1'))
      ).wait();
      console.log('===== Sent CRV to the strategy, harvesting =====');
      const harvestGas = await strategy.estimateGas.harvest();
      if (harvestGas.lte(1000000)) {
        const harvestTx = await strategy.harvest({ gasLimit: 1000000 });
        await harvestTx.wait();
        const strategyBalanceAfterHarvest = await strategy.syncBalance();
        expect(strategyBalanceAfterHarvest.gte(strategyBalanceAfterUncommit)).to.be.true;
        console.log('Strategy DAI balance after harvest:', formatEther(strategyBalanceAfterHarvest));
      }
    } catch (e) {
      console.log('Cannot harvest:', e);
    }
  });
});
