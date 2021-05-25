import { expect } from 'chai';
import { ethers, network } from 'hardhat';

import { getAddress } from '@ethersproject/address';
import { formatUnits, parseEther, parseUnits } from '@ethersproject/units';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { ERC20 } from '../../typechain/ERC20.d';
import { ERC20__factory } from '../../typechain/factories/ERC20__factory';
import { StrategyCompoundErc20LendingPool__factory } from '../../typechain/factories/StrategyCompoundErc20LendingPool__factory';
import { StrategyCompoundErc20LendingPool } from '../../typechain/StrategyCompoundErc20LendingPool';
import { ensureBalanceAndApproval, getDeployerSigner } from '../common';

interface DeployStrategyCompoundErc20LendingPoolInfo {
  strategy: StrategyCompoundErc20LendingPool;
  supplyToken: ERC20;
  deployerSigner: SignerWithAddress;
}

async function deployStrategyCompoundErc20LendingPool(
  deployedAddress: string | undefined,
  supplyTokenSymbol: string,
  supplyTokenAddress: string,
  compoundSupplyTokenAddress: string
): Promise<DeployStrategyCompoundErc20LendingPoolInfo> {
  const deployerSigner = await getDeployerSigner();

  let strategy: StrategyCompoundErc20LendingPool;
  if (deployedAddress) {
    strategy = StrategyCompoundErc20LendingPool__factory.connect(deployedAddress, deployerSigner);
  } else {
    const strategyCompoundErc20LendingPoolFactory = (await ethers.getContractFactory(
      'StrategyCompoundErc20LendingPool'
    )) as StrategyCompoundErc20LendingPool__factory;
    strategy = await strategyCompoundErc20LendingPoolFactory
      .connect(deployerSigner)
      .deploy(
        supplyTokenSymbol,
        supplyTokenAddress,
        compoundSupplyTokenAddress,
        process.env.COMPOUND_COMPTROLLER as string,
        process.env.COMPOUND_COMP as string,
        process.env.UNISWAP_ROUTER as string,
        process.env.WETH as string,
        deployerSigner.address
      );
    await strategy.deployed();
  }

  const supplyToken = ERC20__factory.connect(supplyTokenAddress, deployerSigner);

  return { strategy, supplyToken, deployerSigner };
}

export async function testStrategyCompoundErc20LendingPool(
  context: Mocha.Context,
  deployedAddress: string | undefined,
  supplyTokenSymbol: string,
  supplyTokenDecimals: number,
  supplyTokenAddress: string,
  compoundSupplyTokenAddress: string,
  supplyTokenFunder: string
): Promise<void> {
  context.timeout(300000);

  const { strategy, supplyToken, deployerSigner } = await deployStrategyCompoundErc20LendingPool(
    deployedAddress,
    supplyTokenSymbol,
    supplyTokenAddress,
    compoundSupplyTokenAddress
  );

  expect(getAddress(await strategy.getAssetAddress())).to.equal(getAddress(supplyToken.address));

  const strategyBalanceBeforeCommit = await strategy.callStatic.syncBalance();
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
  const errAmount = parseUnits('0.001', supplyTokenDecimals); // TODO: Investigate why a miniscule error exists
  const commitGas = await strategy.estimateGas.aggregateCommit(commitAmount);
  expect(commitGas.lte(500000)).to.be.true;
  const commitTx = await strategy.aggregateCommit(commitAmount, { gasLimit: 500000 });
  await commitTx.wait();

  const strategyBalanceAfterCommit = await strategy.callStatic.syncBalance();
  expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).add(errAmount).gte(commitAmount)).to.be.true;
  expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).sub(errAmount).lte(commitAmount)).to.be.true;
  console.log(
    `Strategy ${supplyTokenSymbol} balance after commit:`,
    formatUnits(strategyBalanceAfterCommit, supplyTokenDecimals)
  );

  const controllerBalanceAfterCommit = await supplyToken.balanceOf(deployerSigner.address);
  expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).eq(commitAmount)).to.be.true;
  console.log(
    `Controller ${supplyTokenSymbol} balance after commit:`,
    formatUnits(controllerBalanceAfterCommit, supplyTokenDecimals)
  );

  const displayUncommitAmount = '70';
  console.log(`===== Uncommit ${displayUncommitAmount} ${supplyTokenSymbol} =====`);
  const uncommitAmount = parseUnits(displayUncommitAmount, supplyTokenDecimals);
  const uncommitGas = await strategy.estimateGas.aggregateUncommit(uncommitAmount);
  expect(uncommitGas.lte(500000)).to.be.true;
  const uncommitTx = await strategy.aggregateUncommit(uncommitAmount, { gasLimit: 500000 });
  await uncommitTx.wait();

  const strategyBalanceAfterUncommit = await strategy.callStatic.syncBalance();
  expect(strategyBalanceAfterUncommit.add(uncommitAmount).add(errAmount).gte(strategyBalanceAfterCommit)).to.be.true;
  expect(strategyBalanceAfterUncommit.add(uncommitAmount).sub(errAmount).lte(strategyBalanceAfterCommit)).to.be.true;
  console.log(
    `Strategy ${supplyTokenSymbol} balance after uncommit:`,
    formatUnits(strategyBalanceAfterUncommit, supplyTokenDecimals)
  );

  const controllerBalanceAfterUncommit = await supplyToken.balanceOf(deployerSigner.address);
  expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).add(errAmount).gte(uncommitAmount)).to.be
    .true;
  expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).sub(errAmount).lte(uncommitAmount)).to.be
    .true;
  console.log(
    `Controller ${supplyTokenSymbol} balance after uncommit:`,
    formatUnits(controllerBalanceAfterUncommit, supplyTokenDecimals)
  );

  console.log('===== Optional harvest =====');
  try {
    // Send some COMP to the strategy
    const comp = ERC20__factory.connect(process.env.COMPOUND_COMP as string, deployerSigner);
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [process.env.COMPOUND_COMP_FUNDER]
    });
    await (
      await comp
        .connect(await ethers.getSigner(process.env.COMPOUND_COMP_FUNDER as string))
        .transfer(strategy.address, parseEther('0.01'))
    ).wait();
    console.log('===== Sent COMP to the strategy, harvesting =====');
    const harvestGas = await strategy.estimateGas.harvest();
    if (harvestGas.lte(2000000)) {
      const harvestTx = await strategy.harvest({ gasLimit: 2000000 });
      await harvestTx.wait();
      const strategyBalanceAfterHarvest = await strategy.callStatic.syncBalance();
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
