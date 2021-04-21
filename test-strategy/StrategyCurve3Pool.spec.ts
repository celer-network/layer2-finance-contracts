import { expect } from 'chai';
import * as dotenv from 'dotenv';
import { ethers, network } from 'hardhat';

import { getAddress } from '@ethersproject/address';
import { formatUnits, parseEther, parseUnits } from '@ethersproject/units';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { ERC20 } from '../typechain/ERC20.d';
import { ERC20__factory } from '../typechain/factories/ERC20__factory';
import { StrategyCurve3Pool__factory } from '../typechain/factories/StrategyCurve3Pool__factory';
import { StrategyCurve3Pool } from '../typechain/StrategyCurve3Pool';
import { ensureBalanceAndApproval, getDeployerSigner } from './common';

dotenv.config();

interface DeployStrategyCurve3PoolInfo {
  strategy: StrategyCurve3Pool;
  supplyToken: ERC20;
  deployerSigner: SignerWithAddress;
}

async function deployStrategyCurve3Pool(
  deployedAddress: string | undefined,
  supplyTokenDecimals: number,
  supplyToken3PoolIndex: number,
  supplyTokenAddress: string
): Promise<DeployStrategyCurve3PoolInfo> {
  const deployerSigner = await getDeployerSigner();

  let strategy: StrategyCurve3Pool;
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
        supplyTokenAddress,
        supplyTokenDecimals,
        supplyToken3PoolIndex,
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

  const supplyToken = ERC20__factory.connect(supplyTokenAddress, deployerSigner);

  return { strategy, supplyToken, deployerSigner };
}

export async function testStrategyCurve3Pool(
  context: Mocha.Context,
  deployedAddress: string | undefined,
  supplyTokenSymbol: string,
  supplyTokenDecimals: number,
  supplyToken3PoolIndex: number,
  supplyTokenAddress: string,
  supplyTokenFunder: string
): Promise<void> {
  context.timeout(300000);

  const { strategy, supplyToken, deployerSigner } = await deployStrategyCurve3Pool(
    deployedAddress,
    supplyTokenDecimals,
    supplyToken3PoolIndex,
    supplyTokenAddress
  );

  expect(getAddress(await strategy.getAssetAddress())).to.equal(getAddress(supplyToken.address));

  const strategyBalanceBeforeCommit = await strategy.syncBalance();
  console.log(
    `Strategy ${supplyTokenSymbol} balance before commit:`,
    formatUnits(strategyBalanceBeforeCommit, supplyTokenDecimals)
  );

  const displayCommitAmount = '100';
  const commitAmount = parseUnits(displayCommitAmount, supplyTokenDecimals);
  await ensureBalanceAndApproval(
    supplyToken,
    supplyTokenSymbol,
    commitAmount,
    deployerSigner,
    strategy.address,
    supplyTokenFunder
  );
  const controllerBalanceBeforeCommit = await supplyToken.balanceOf(deployerSigner.address);
  console.log(
    `Controller ${supplyTokenSymbol} balance before commit:`,
    formatUnits(controllerBalanceBeforeCommit, supplyTokenDecimals)
  );

  console.log(`===== Commit ${displayCommitAmount} ${supplyTokenSymbol} =====`);
  const slippageAmount = parseUnits('0.06', supplyTokenDecimals);
  const commitGas = await strategy.estimateGas.aggregateCommit(commitAmount);
  expect(commitGas.lte(1000000)).to.be.true;
  const commitTx = await strategy.aggregateCommit(commitAmount, { gasLimit: 1000000 });
  await commitTx.wait();

  const strategyBalanceAfterCommit = await strategy.syncBalance();
  expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).add(slippageAmount).gte(commitAmount)).to.be.true;
  expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).sub(slippageAmount).lte(commitAmount)).to.be.true;
  console.log(
    `Strategy ${supplyTokenSymbol} balance after commit:`,
    formatUnits(strategyBalanceAfterCommit, supplyTokenDecimals)
  );

  const controllerBalanceAfterCommit = await supplyToken.balanceOf(deployerSigner.address);
  expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).add(slippageAmount).gte(commitAmount)).to.be
    .true;
  expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).sub(slippageAmount).lte(commitAmount)).to.be
    .true;
  console.log(
    `Controller ${supplyTokenSymbol} balance after commit:`,
    formatUnits(controllerBalanceAfterCommit, supplyTokenDecimals)
  );

  const displayUncommitAmount = '70';
  const uncommitAmount = parseUnits(displayUncommitAmount, supplyTokenDecimals);
  console.log(`===== Uncommit ${displayUncommitAmount} ${supplyTokenSymbol} =====`);
  const uncommitGas = await strategy.estimateGas.aggregateUncommit(uncommitAmount);
  expect(uncommitGas.lte(1000000)).to.be.true;
  const uncommitTx = await strategy.aggregateUncommit(uncommitAmount, { gasLimit: 1000000 });
  await uncommitTx.wait();

  const strategyBalanceAfterUncommit = await strategy.syncBalance();
  expect(strategyBalanceAfterUncommit.add(uncommitAmount).add(slippageAmount).gte(strategyBalanceAfterCommit)).to.be
    .true;
  expect(strategyBalanceAfterUncommit.add(uncommitAmount).sub(slippageAmount).lte(strategyBalanceAfterCommit)).to.be
    .true;
  console.log(
    `Strategy ${supplyTokenSymbol} balance after uncommit:`,
    formatUnits(strategyBalanceAfterUncommit, supplyTokenDecimals)
  );

  const controllerBalanceAfterUncommit = await supplyToken.balanceOf(deployerSigner.address);
  expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).add(slippageAmount).gte(uncommitAmount)).to.be
    .true;
  expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).sub(slippageAmount).lte(uncommitAmount)).to.be
    .true;
  console.log(
    `Controller ${supplyTokenSymbol} balance after uncommit:`,
    formatUnits(controllerBalanceAfterUncommit, supplyTokenDecimals)
  );

  console.log('===== Optional harvest =====');
  try {
    // Send some CRV to the strategy
    const crv = ERC20__factory.connect(process.env.CURVE_CRV as string, deployerSigner);
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [process.env.CURVE_CRV_FUNDER]
    });
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
      console.log(
        `Strategy ${supplyTokenSymbol} balance after harvest:`,
        formatUnits(strategyBalanceAfterHarvest, supplyTokenDecimals)
      );
    }
  } catch (e) {
    console.log('Cannot harvest:', e);
  }
}
