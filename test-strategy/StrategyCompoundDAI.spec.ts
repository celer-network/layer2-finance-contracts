import { expect } from 'chai';
import * as dotenv from 'dotenv';
import { ethers, getNamedAccounts } from 'hardhat';

import { getAddress } from '@ethersproject/address';
import { MaxUint256 } from '@ethersproject/constants';
import { formatEther, parseEther } from '@ethersproject/units';

import { ERC20__factory } from '../typechain/factories/ERC20__factory';
import { StrategyCompoundErc20LendingPool__factory } from '../typechain/factories/StrategyCompoundErc20LendingPool__factory';
import { StrategyCompoundErc20LendingPool } from '../typechain/StrategyCompoundErc20LendingPool.d';

dotenv.config();

describe('StrategyCompoundDAI', function () {
  async function deploy() {
    const { deployer } = await getNamedAccounts();
    const deployerSigner = await ethers.getSigner(deployer);

    let strategy: StrategyCompoundErc20LendingPool;
    const deployedAddress = process.env.STRATEGY_COMPOUND_DAI;
    if (deployedAddress) {
      strategy = StrategyCompoundErc20LendingPool__factory.connect(deployedAddress, deployerSigner);
    } else {
      const strategyCompoundErc20LendingPoolFactory = (await ethers.getContractFactory(
        'StrategyCompoundErc20LendingPool'
      )) as StrategyCompoundErc20LendingPool__factory;
      strategy = await strategyCompoundErc20LendingPoolFactory.deploy(
        'DAI',
        process.env.COMPOUND_DAI as string,
        process.env.COMPOUND_CDAI as string,
        process.env.COMPOUND_COMPTROLLER as string,
        process.env.COMPOUND_COMP as string,
        process.env.UNISWAP_ROUTER as string,
        process.env.WETH as string,
        deployer
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

    const strategyBalanceBeforeCommit = await strategy.callStatic.syncBalance();
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
    const commitGas = await strategy.estimateGas.aggregateCommit(commitAmount);
    expect(commitGas.lte(300000)).to.be.true;
    const commitTx = await strategy.aggregateCommit(commitAmount, { gasLimit: 300000 });
    await commitTx.wait();

    const strategyBalanceAfterCommit = await strategy.callStatic.syncBalance();
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

    const strategyBalanceAfterUncommit = await strategy.callStatic.syncBalance();
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
