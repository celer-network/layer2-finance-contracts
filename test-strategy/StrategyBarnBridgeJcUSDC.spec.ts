import { expect } from 'chai';
import * as dotenv from 'dotenv';
import { ethers, network } from 'hardhat';

import { getAddress } from '@ethersproject/address';
import { MaxUint256 } from '@ethersproject/constants';
import { formatEther, parseEther, parseUnits, formatUnits } from '@ethersproject/units';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { ERC20__factory } from '../typechain/factories/ERC20__factory';
import { StrategyBarnBridgeJToken__factory } from '../typechain/factories/StrategyBarnBridgeJToken__factory';
import { StrategyBarnBridgeJToken } from '../typechain/StrategyBarnBridgeJToken';
import { ensureBalanceAndApproval, getDeployerSigner } from './common';

import { SmartYield__factory } from '../typechain/factories/SmartYield__factory';
import { SmartYield } from '../typechain/SmartYield';

dotenv.config();

describe('StrategyBarnBridgeJcUSDC', function () {
  async function deploy() {
    const deployerSigner = await getDeployerSigner();

    let strategy: StrategyBarnBridgeJToken;
    const deployedAddress = process.env.STRATEGY_BARN_BRIDGE_JC_USDC;
    if (deployedAddress) {
      strategy = StrategyBarnBridgeJToken__factory.connect(deployedAddress, deployerSigner);
    } else {
      const StrategyBarnBridgeJTokenFactory = (await ethers.getContractFactory(
        'StrategyBarnBridgeJToken'
      )) as StrategyBarnBridgeJToken__factory;
      strategy = await StrategyBarnBridgeJTokenFactory
        .connect(deployerSigner)
        .deploy(
          process.env.BARN_BRIDGE_USDC_SMART_YIELD as string,
          process.env.BARN_BRIDGE_USDC_COMP_PROVIDER_POOL as string,
          'USDC',
          process.env.BARN_BRIDGE_USDC_YIELD_FARM as string,
          process.env.USDC as string,
          process.env.BARN_BRIDGE_BOND as string,
          process.env.UNISWAP_ROUTER as string,
          deployerSigner.address
        );
      await strategy.deployed();
    }

    const usdc = ERC20__factory.connect(process.env.USDC as string, deployerSigner);

    return { strategy, usdc, deployerSigner };
  }

  it('should commit, uncommit and optionally harvest', async function () {
    this.timeout(300000);

    const { strategy, usdc, deployerSigner } = await deploy();

    expect(getAddress(await strategy.getAssetAddress())).to.equal(getAddress(usdc.address));
 
    const strategyBalanceBeforeCommit = await strategy.callStatic.syncBalance();
    console.log('Strategy USDC balance before commit:', formatUnits(strategyBalanceBeforeCommit, 6));
    const controllerBalanceBeforeCommit = await usdc.balanceOf(deployerSigner.address);
    console.log('Controller USDC balance before commit:', formatUnits(controllerBalanceBeforeCommit, 6));

    const smartYield = SmartYield__factory.connect(process.env.BARN_BRIDGE_USDC_SMART_YIELD as string, deployerSigner);
    const beforCommitJTokenPrice = await smartYield.callStatic.price();
    console.log('bb_cUSDC price before commit:', formatEther(beforCommitJTokenPrice));
   
    const commitAmount = parseUnits('1', 6);
    await ensureBalanceAndApproval(
      usdc,
      'USDC',
      commitAmount,
      deployerSigner,
      strategy.address,
      process.env.USDC_FUNDER as string
    )

    console.log('===== Commit 1 USDC =====');  
    // Currently buy junior token fee is 0.5% 
    const fee = parseUnits('0.005', 6);

    const commitGas = await strategy.estimateGas.aggregateCommit(commitAmount);
    expect(commitGas.lte(800000)).to.be.true;
    const commitTx = await strategy.aggregateCommit(commitAmount, { gasLimit: 800000 });
    await commitTx.wait();

    const afterCommitJTokenPrice = await smartYield.callStatic.price();
    console.log('bb_cUSDC price after commit:', formatEther(afterCommitJTokenPrice));
    
    const strategyBalanceAfterCommit = await strategy.callStatic.syncBalance();
    // debt share at block-number 12400000
    // arg is (1 - fee) / afterCommitJTokenPrice
    const afterCommitForfeits = await strategy.callStatic.calForfeits(parseUnits('0.959', 6));
    const errorByJToknPrice = parseUnits('0.000002', 6); // price difference when commit/uncommit 
    
    expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit)
      .gte(commitAmount.sub(fee).sub(afterCommitForfeits).sub(errorByJToknPrice))).to.be.true;
    expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit)
      .lte(commitAmount.sub(fee).sub(afterCommitForfeits).add(errorByJToknPrice))).to.be.true;
    console.log('Strategy USDC balance after commit:', formatUnits(strategyBalanceAfterCommit, 6));
    
    const controllerBalanceAfterCommit = await usdc.balanceOf(deployerSigner.address);
    expect(controllerBalanceBeforeCommit.sub(controllerBalanceAfterCommit).eq(commitAmount)).to.be.true;
    console.log('Controller USDC balance after commit:', formatUnits(controllerBalanceAfterCommit, 6));
   
    console.log('===== Uncommit 0.5 USDC =====');
    const uncommitAmount = parseUnits('0.5', 6);
    const uncommitGas = await strategy.estimateGas.aggregateUncommit(uncommitAmount);
    expect(uncommitGas.lte(800000)).to.be.true;
    const uncommitTx = await strategy.aggregateUncommit(uncommitAmount, { gasLimit: 800000 });
    await uncommitTx.wait();

    const afterUncommitJTokenPrice = await smartYield.callStatic.price();
    console.log('bb_cUSDC price after commit:', formatEther(afterUncommitJTokenPrice));

    const strategyBalanceAfterUncommit = await strategy.callStatic.syncBalance();
    // debt share at block-number 12400000
    // arg is 0.5 / afterUncommitJTokenPrice
    const afterUncommitForfeits = await strategy.callStatic.calForfeits(parseUnits('0.482', 6));
    expect(strategyBalanceAfterCommit.sub(strategyBalanceAfterUncommit)
      .gte(uncommitAmount.sub(afterUncommitForfeits).sub(errorByJToknPrice))).to.be.true;
    expect(strategyBalanceAfterCommit.sub(strategyBalanceAfterUncommit)
      .lte(uncommitAmount.sub(afterUncommitForfeits).add(errorByJToknPrice))).to.be.true;
    console.log('Strategy USDC balance after uncommit:', formatUnits(strategyBalanceAfterUncommit, 6));

    const controllerBalanceAfterUncommit = await usdc.balanceOf(deployerSigner.address);
    expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit)
      .gte(uncommitAmount.sub(afterUncommitForfeits).sub(errorByJToknPrice))).to.be.true;
    expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit)
      .lte(uncommitAmount.sub(afterUncommitForfeits).add(errorByJToknPrice))).to.be.true;
    console.log('Controller USDC balance after uncommit:', formatUnits(controllerBalanceAfterUncommit, 6));

    console.log('===== Optional harvest =====');
    try {
      // Send some BOND to strategy
      const bond = ERC20__factory.connect(process.env.BARN_BRIDGE_BOND as string, deployerSigner);
      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [process.env.BARN_BRIDGE_BOND_FUNDER as string]
      });
      await (
        await bond
          .connect(await ethers.getSigner(process.env.BARN_BRIDGE_BOND_FUNDER as string))
          .transfer(strategy.address, parseEther('0.01'))
      ).wait();
      const harvestGas = await strategy.estimateGas.harvest();
      if (harvestGas.lte(1000000)) {
        const harvestTx = await strategy.harvest({ gasLimit: 1000000 });
        await harvestTx.wait();
        const strategyBalanceAfterHarvest = await strategy.callStatic.syncBalance();
        expect(strategyBalanceAfterHarvest.gte(strategyBalanceAfterUncommit)).to.be.true;
        console.log('Strategy USDC balance after harvest:', formatUnits(strategyBalanceAfterHarvest, 6));
      }
    } catch (e) {
      console.log('Cannot harvest:', e);
    }
  });
});
