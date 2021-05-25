import { expect } from 'chai';
import * as dotenv from 'dotenv';
import { ethers, network } from 'hardhat';

import { getAddress } from '@ethersproject/address';
import { formatUnits, parseEther, parseUnits } from '@ethersproject/units';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { ERC20 } from '../../typechain/ERC20';
import { ERC20__factory } from '../../typechain/factories/ERC20__factory';
import { StrategyCurveEth__factory } from '../../typechain/factories/StrategyCurveEth__factory';
import { StrategyCurveEth } from '../../typechain/StrategyCurveEth';
import { ensureBalanceAndApproval, getDeployerSigner } from '../common';

dotenv.config();

const ETH_DECIMALS = 18;

interface DeployStrategyCurveEthInfo {
  strategy: StrategyCurveEth;
  weth: ERC20;
  deployerSigner: SignerWithAddress;
}

async function deployStrategyCurveEth(
  deployedAddress: string | undefined,
  ethIndexInPool: number,
  poolAddress: string,
  lpTokenAddress: string,
  gaugeAddress: string
): Promise<DeployStrategyCurveEthInfo> {
  const deployerSigner = await getDeployerSigner();

  let strategy: StrategyCurveEth;

  // connect to strategy contract, deploy the contract if it's not deployed yet
  if (deployedAddress) {
    strategy = StrategyCurveEth__factory.connect(deployedAddress, deployerSigner);
  } else {
    const strategyCurveEthFactory = (await ethers.getContractFactory('StrategyCurveEth')) as StrategyCurveEth__factory;
    strategy = await strategyCurveEthFactory
      .connect(deployerSigner)
      .deploy(
        deployerSigner.address,
        ethIndexInPool,
        poolAddress,
        lpTokenAddress,
        gaugeAddress,
        process.env.CURVE_MINTR as string,
        process.env.CURVE_CRV as string,
        process.env.WETH as string,
        process.env.UNISWAP_ROUTER as string
      );
    await strategy.deployed();
  }

  const weth = ERC20__factory.connect(process.env.WETH as string, deployerSigner);

  return { strategy, weth, deployerSigner };
}

export async function testStrategyCurveEth(
  context: Mocha.Context,
  deployedAddress: string | undefined,
  ethIndexInPool: number,
  poolAddress: string,
  lpTokenAddress: string,
  gaugeAddress: string,
  supplyTokenFunder: string
): Promise<void> {
  context.timeout(300000);
  const { strategy, weth, deployerSigner } = await deployStrategyCurveEth(
    deployedAddress,
    ethIndexInPool,
    poolAddress,
    lpTokenAddress,
    gaugeAddress
  );
  expect(getAddress(await strategy.getAssetAddress())).to.equal(getAddress(weth.address));

  const strategyBalanceBeforeCommit = await strategy.syncBalance();
  console.log(`Strategy WETH balance before commit:`, formatUnits(strategyBalanceBeforeCommit, ETH_DECIMALS));

  const displayCommitAmount = '0.1';
  const commitAmount = parseUnits(displayCommitAmount, ETH_DECIMALS);
  await ensureBalanceAndApproval(weth, 'WETH', commitAmount, deployerSigner, strategy.address, supplyTokenFunder);
  const controllerBalanceBeforeCommit = await weth.balanceOf(deployerSigner.address);
  console.log(`Controller WETH balance before commit:`, formatUnits(controllerBalanceBeforeCommit, ETH_DECIMALS));

  console.log(`===== Commit ${displayCommitAmount} WETH =====`);
  const slippageAmount = parseUnits('0.06', ETH_DECIMALS);
  const commitGas = await strategy.estimateGas.aggregateCommit(commitAmount);
  expect(commitGas.lte(1000000)).to.be.true;
  const commitTx = await strategy.aggregateCommit(commitAmount, { gasLimit: 1000000 });
  await commitTx.wait();

  const strategyBalanceAfterCommit = await strategy.syncBalance();
  expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).add(slippageAmount).gte(commitAmount)).to.be.true;
  expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).sub(slippageAmount).lte(commitAmount)).to.be.true;
  console.log(`Strategy WETH balance after commit:`, formatUnits(strategyBalanceAfterCommit, ETH_DECIMALS));

  const controllerBalanceAfterCommit = await weth.balanceOf(deployerSigner.address);
  expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).add(slippageAmount).gte(commitAmount)).to.be
    .true;
  expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).sub(slippageAmount).lte(commitAmount)).to.be
    .true;
  console.log(`Controller WETH balance after commit:`, formatUnits(controllerBalanceAfterCommit, ETH_DECIMALS));

  const displayUncommitAmount = '0.07';
  const uncommitAmount = parseUnits(displayUncommitAmount, ETH_DECIMALS);
  console.log(`===== Uncommit ${displayUncommitAmount} WETH =====`);
  const uncommitGas = await strategy.estimateGas.aggregateUncommit(uncommitAmount);
  expect(uncommitGas.lte(1000000)).to.be.true;
  const uncommitTx = await strategy.aggregateUncommit(uncommitAmount, { gasLimit: 1000000 });
  await uncommitTx.wait();

  const strategyBalanceAfterUncommit = await strategy.syncBalance();
  expect(strategyBalanceAfterUncommit.add(uncommitAmount).add(slippageAmount).gte(strategyBalanceAfterCommit)).to.be
    .true;
  expect(strategyBalanceAfterUncommit.add(uncommitAmount).sub(slippageAmount).lte(strategyBalanceAfterCommit)).to.be
    .true;
  console.log(`Strategy WETH balance after uncommit:`, formatUnits(strategyBalanceAfterUncommit, ETH_DECIMALS));

  const controllerBalanceAfterUncommit = await weth.balanceOf(deployerSigner.address);
  expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).add(slippageAmount).gte(uncommitAmount)).to.be
    .true;
  expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).sub(slippageAmount).lte(uncommitAmount)).to.be
    .true;
  console.log(`Controller WETH balance after uncommit:`, formatUnits(controllerBalanceAfterUncommit, ETH_DECIMALS));

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
      console.log(`Strategy WETH balance after harvest:`, formatUnits(strategyBalanceAfterHarvest, ETH_DECIMALS));
    }
  } catch (e) {
    console.log('Cannot harvest:', e);
  }
}
