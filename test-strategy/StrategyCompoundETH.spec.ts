import { expect } from 'chai';
import { ethers } from 'hardhat';

import { getAddress } from '@ethersproject/address';
import { MaxUint256 } from '@ethersproject/constants';
import { formatEther, parseEther } from '@ethersproject/units';

import { ERC20__factory } from '../typechain/factories/ERC20__factory';
import { StrategyCompoundEthLendingPool__factory } from '../typechain/factories/StrategyCompoundEthLendingPool__factory';
import { StrategyCompoundEthLendingPool } from '../typechain/StrategyCompoundEthLendingPool.d';
import { getDeployerSigner } from './common';

describe('StrategyCompoundETH', function () {
  async function deploy() {
    const deployerSigner = await getDeployerSigner();

    let strategy: StrategyCompoundEthLendingPool;
    const deployedAddress = process.env.STRATEGY_COMPOUND_ETH;
    if (deployedAddress) {
      strategy = StrategyCompoundEthLendingPool__factory.connect(deployedAddress, deployerSigner);
    } else {
      const strategyCompoundEthLendingPoolFactory = (await ethers.getContractFactory(
        'StrategyCompoundEthLendingPool'
      )) as StrategyCompoundEthLendingPool__factory;
      strategy = await strategyCompoundEthLendingPoolFactory.deploy(
        process.env.COMPOUND_CETH as string,
        process.env.COMPOUND_COMPTROLLER as string,
        process.env.COMPOUND_COMP as string,
        process.env.UNISWAP_ROUTER as string,
        process.env.WETH as string,
        deployerSigner.address
      );
      await strategy.deployed();
    }

    const weth = ERC20__factory.connect(process.env.WETH as string, deployerSigner);

    return { strategy, weth, deployerSigner };
  }

  it('should commit, uncommit and optionally harvest', async function () {
    this.timeout(300000);

    const { strategy, weth, deployerSigner } = await deploy();

    expect(getAddress(await strategy.getAssetAddress())).to.equal(getAddress(weth.address));

    const strategyBalanceBeforeCommit = await strategy.callStatic.syncBalance();
    console.log('Strategy WETH balance before commit:', formatEther(strategyBalanceBeforeCommit));
    const controllerBalanceBeforeCommit = await weth.balanceOf(deployerSigner.address);
    console.log('Controller WETH balance before commit:', formatEther(controllerBalanceBeforeCommit));

    console.log('===== Approve WETH =====');
    if ((await weth.allowance(deployerSigner.address, strategy.address)).eq(0)) {
      const approveTx = await weth.connect(deployerSigner).approve(strategy.address, MaxUint256);
      await approveTx.wait();
    }

    console.log('===== Commit 0.1 WETH =====');
    const commitAmount = parseEther('0.1');
    const commitGas = await strategy.estimateGas.aggregateCommit(commitAmount);
    expect(commitGas.lte(300000)).to.be.true;
    const commitTx = await strategy.aggregateCommit(commitAmount, { gasLimit: 300000 });
    await commitTx.wait();

    const strategyBalanceAfterCommit = await strategy.callStatic.syncBalance();
    expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).gte(parseEther('0.1'))).to.be.true;
    console.log('Strategy WETH balance after commit:', formatEther(strategyBalanceAfterCommit));

    const controllerBalanceAfterCommit = await weth.balanceOf(deployerSigner.address);
    expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).eq(parseEther('0.1'))).to.be.true;
    console.log('Controller WETH balance after commit:', formatEther(controllerBalanceAfterCommit));

    console.log('===== Uncommit 0.08 WETH =====');
    const uncommitAmount = parseEther('0.08');
    const uncommitGas = await strategy.estimateGas.aggregateUncommit(uncommitAmount);
    expect(uncommitGas.lte(300000)).to.be.true;
    const uncommitTx = await strategy.aggregateUncommit(uncommitAmount, { gasLimit: 300000 });
    await uncommitTx.wait();

    const strategyBalanceAfterUncommit = await strategy.callStatic.syncBalance();
    expect(strategyBalanceAfterUncommit.add(uncommitAmount).gte(strategyBalanceAfterCommit)).to.be.true;
    console.log('Strategy WETH balance after uncommit:', formatEther(strategyBalanceAfterUncommit));

    const controllerBalanceAfterUncommit = await weth.balanceOf(deployerSigner.address);
    expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).eq(uncommitAmount)).to.be.true;
    console.log('Controller WETH balance after uncommit:', formatEther(controllerBalanceAfterUncommit));

    console.log('===== Optional harvest =====');
    try {
      const harvestGas = await strategy.estimateGas.harvest();
      if (harvestGas.lte(300000)) {
        const harvestTx = await strategy.harvest({ gasLimit: 300000 });
        await harvestTx.wait();
        const strategyBalanceAfterHarvest = await strategy.callStatic.syncBalance();
        expect(strategyBalanceAfterHarvest.gte(strategyBalanceAfterUncommit)).to.be.true;
        console.log('Strategy WETH balance after harvest:', formatEther(strategyBalanceAfterHarvest));
      }
    } catch (e) {
      console.log('Cannot harvest:', e);
    }
  });
});
