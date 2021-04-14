import { expect } from 'chai';
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';

import { getAddress } from '@ethersproject/address';
import { MaxUint256 } from '@ethersproject/constants';
import { formatEther, parseEther } from '@ethersproject/units';

import { ERC20__factory } from '../typechain/factories/ERC20__factory';
import { StrategyCurve3PoolDAI__factory } from '../typechain/factories/StrategyCurve3PoolDAI__factory';
import { StrategyCurve3PoolDAI } from '../typechain/StrategyCurve3PoolDAI';
import { getDeployerSigner } from './common';

dotenv.config();

describe('StrategyCurve3PoolDAI', function () {
  async function deploy() {
    const deployerSigner = await getDeployerSigner();

    let strategy: StrategyCurve3PoolDAI;
    const deployedAddress = process.env.STRATEGY_CURVE_3POOL_DAI;
    if (deployedAddress) {
      strategy = StrategyCurve3PoolDAI__factory.connect(deployedAddress, deployerSigner);
    } else {
      const strategyCurve3PoolDAIFactory = (await ethers.getContractFactory(
        'StrategyCurve3PoolDAI'
      )) as StrategyCurve3PoolDAI__factory;
      strategy = await strategyCurve3PoolDAIFactory
        .connect(deployerSigner)
        .deploy(
          deployerSigner.address,
          process.env.CURVE_DAI as string,
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

    const dai = ERC20__factory.connect(process.env.COMPOUND_DAI as string, deployerSigner);

    return { strategy, dai, deployerSigner };
  }

  it('should commit, uncommit and optionally harvest', async function () {
    this.timeout(300000);

    const { strategy, dai, deployerSigner } = await deploy();

    expect(getAddress(await strategy.getAssetAddress())).to.equal(getAddress(dai.address));

    const strategyBalanceBeforeCommit = await strategy.syncBalance();
    console.log('Strategy DAI balance before commit:', formatEther(strategyBalanceBeforeCommit));
    const controllerBalanceBeforeCommit = await dai.balanceOf(deployerSigner.address);
    console.log('Controller DAI balance before commit:', formatEther(controllerBalanceBeforeCommit));

    console.log('===== Approve DAI =====');
    if ((await dai.allowance(deployerSigner.address, strategy.address)).eq(0)) {
      const approveTx = await dai.connect(deployerSigner).approve(strategy.address, MaxUint256);
      await approveTx.wait();
    }

    console.log('===== Commit 0.001 DAI =====');
    const commitAmount = parseEther('0.001');
    const slippageAmount = parseEther('0.0003');
    const commitGas = await strategy.estimateGas.aggregateCommit(commitAmount);
    expect(commitGas.lte(1000000)).to.be.true;
    const commitTx = await strategy.aggregateCommit(commitAmount, { gasLimit: 1000000 });
    await commitTx.wait();

    const strategyBalanceAfterCommit = await strategy.syncBalance();
    expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).add(slippageAmount).gte(commitAmount)).to.be
      .true;
    console.log('Strategy DAI balance after commit:', formatEther(strategyBalanceAfterCommit));

    const controllerBalanceAfterCommit = await dai.balanceOf(deployerSigner.address);
    expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).eq(commitAmount)).to.be.true;
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
    console.log('Strategy DAI balance after uncommit:', formatEther(strategyBalanceAfterUncommit));

    const controllerBalanceAfterUncommit = await dai.balanceOf(deployerSigner.address);
    expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).add(slippageAmount).gte(uncommitAmount)).to
      .be.true;
    console.log('Controller DAI balance after uncommit:', formatEther(controllerBalanceAfterUncommit));

    console.log('===== Optional harvest =====');
    try {
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
