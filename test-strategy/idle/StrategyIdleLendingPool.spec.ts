import { expect } from 'chai';
import * as dotenv from 'dotenv';
import { ethers, network } from 'hardhat';

import { getAddress } from '@ethersproject/address';
import { formatUnits, parseEther, parseUnits } from '@ethersproject/units';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { ERC20 } from '../../typechain/ERC20.d';
import { ERC20__factory } from '../../typechain/factories/ERC20__factory';
import { StrategyIdleLendingPool__factory } from '../../typechain/factories/StrategyIdleLendingPool__factory';
import { StrategyIdleLendingPool } from '../../typechain/StrategyIdleLendingPool';
import { GovTokenRegistry__factory } from '../../typechain/factories/GovTokenRegistry__factory';
import { GovTokenRegistry } from '../../typechain/GovTokenRegistry';
import { ensureBalanceAndApproval, getDeployerSigner } from '../common';

dotenv.config();

interface DeployStrategyIdleLendingPoolInfo {
    strategy: StrategyIdleLendingPool;
    supplyToken: ERC20;
    deployerSigner: SignerWithAddress;
}

async function deployGovTokenRegistry(
    deployedAddress: string | undefined,
): Promise<GovTokenRegistry> {
    const deployerSigner = await getDeployerSigner();

    let govTokenRegistry: GovTokenRegistry;
    if(deployedAddress) {
        govTokenRegistry = GovTokenRegistry__factory.connect(deployedAddress, deployerSigner);
    } else {
        const govTokenRegistryFactory = (await ethers.getContractFactory(
            'GovTokenRegistry'
        )) as GovTokenRegistry__factory;
        govTokenRegistry = await govTokenRegistryFactory
            .connect(deployerSigner)
            .deploy(
                process.env.COMPOUND_COMP as string,
                process.env.IDLE_IDLE as string,
                process.env.AAVE_AAVE as string
            );
        await govTokenRegistry.deployed();
    }
    return govTokenRegistry;
}

async function deployStrategyIdleLendingPool(
    deployedAddress: string | undefined,
    supplyTokenSymbol: string,
    supplyTokenAddress: string,
    supplyTokenDecimals: number,
    idleTokenAddress: string,
    govTokenRegistryAddress: string
): Promise<DeployStrategyIdleLendingPoolInfo> {
    const deployerSigner = await getDeployerSigner();

    let strategy: StrategyIdleLendingPool;
    if (deployedAddress) {
        strategy = StrategyIdleLendingPool__factory.connect(deployedAddress, deployerSigner);
    } else {
        const strategyIdleLendingPoolFactory = (await ethers.getContractFactory(
            'StrategyIdleLendingPool'
        )) as StrategyIdleLendingPool__factory;
        strategy = await strategyIdleLendingPoolFactory
            .connect(deployerSigner)
            .deploy(
                idleTokenAddress,
                supplyTokenSymbol,
                supplyTokenAddress,
                supplyTokenDecimals,
                govTokenRegistryAddress,
                process.env.AAVE_STAKED_AAVE as string,
                process.env.WETH as string,
                process.env.SUSHISWAP_ROUTER as string,
                deployerSigner.address 
            );
        await strategy.deployed();
    }

    const supplyToken = ERC20__factory.connect(supplyTokenAddress, deployerSigner)

    return { strategy, supplyToken, deployerSigner };
}

export async function testStrategyIdleLendingPool(
    context: Mocha.Context,
    deployedAddress: string | undefined,
    supplyTokenSymbol: string,
    supplyTokenAddress: string,
    supplyTokenDecimals: number,
    idleTokenAddress: string,
    supplyTokenFunder: string
): Promise<void> {
    context.timeout(300000);

    const govTokenRegistry = await deployGovTokenRegistry(deployedAddress);
    const { strategy, supplyToken, deployerSigner } = await deployStrategyIdleLendingPool(
        deployedAddress,
        supplyTokenSymbol,
        supplyTokenAddress,
        supplyTokenDecimals,
        idleTokenAddress,
        govTokenRegistry.address 
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
    const commitGas = await strategy.estimateGas.aggregateCommit(commitAmount);
    expect(commitGas.lte(1500000));
    const commitTx = await strategy.aggregateCommit(commitAmount, {gasLimit: 1500000});
    await commitTx.wait();

    const strategyBalanceAfterCommit = await strategy.callStatic.syncBalance();
    const errAmount = parseUnits('0.000001', supplyTokenDecimals);
    expect(strategyBalanceAfterCommit.sub(strategyBalanceBeforeCommit).add(errAmount).gte(commitAmount)).to.be.true;
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

    const displayUncommitAmount = '90';
    console.log(`===== Uncommit ${displayUncommitAmount} ${supplyTokenSymbol} =====`);
    const uncommitAmount = parseUnits(displayUncommitAmount, supplyTokenDecimals);
    const uncommitGas = await strategy.estimateGas.aggregateUncommit(uncommitAmount);
    expect(uncommitGas.lte(1500000));
    const uncommitTx = await strategy.aggregateUncommit(uncommitAmount, {gasLimit: 1500000});
    await uncommitTx.wait();
    const strategyBalanceAfterUncommit = await strategy.callStatic.syncBalance();
    expect(strategyBalanceAfterUncommit.add(uncommitAmount).gte(strategyBalanceAfterCommit)).to.be.true;
    console.log(
        `Strategy ${supplyTokenSymbol} balance after uncommit:`,
        formatUnits(strategyBalanceAfterUncommit, supplyTokenDecimals)
    );

    const controllerBalanceAfterUncommit = await supplyToken.balanceOf(deployerSigner.address);
    expect(controllerBalanceAfterUncommit.sub(controllerBalanceAfterCommit).add(errAmount).gte(displayUncommitAmount)).to.be.true;
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

        // Send some IDLE to the strategy
        const idle = ERC20__factory.connect(process.env.IDLE_IDLE as string, deployerSigner);
        await network.provider.request({
            method: 'hardhat_impersonateAccount',
            params: [process.env.IDLE_IDLE_FUNDER]
        });
        await (
            await idle
              .connect(await ethers.getSigner(process.env.IDLE_IDLE_FUNDER as string))
              .transfer(strategy.address, parseEther('0.01'))
        ).wait();

        // Send some AAVE to the strategy
        const aave = ERC20__factory.connect(process.env.AAVE_AAVE as string, deployerSigner);
        await network.provider.request({
            method: 'hardhat_impersonateAccount',
            params: [process.env.AAVE_AAVE_FUNDER]
        });
        await (
            await aave
              .connect(await ethers.getSigner(process.env.AAVE_AAVE_FUNDER as string))
              .transfer(strategy.address, parseEther('0.01'))
        ).wait();

        console.log('===== Sent COMP, AAVE and IDLE to the strategy, harvesting =====');
        const harvestGas = await strategy.estimateGas.harvest();
        if (harvestGas.lte(1200000)) {
            const harvestTx = await strategy.harvest({ gasLimit: 1200000 });
            const receipt = await harvestTx.wait();
            console.log('Harvest gas used:', receipt.gasUsed.toString());
            const strategyBalanceAfterHarvest = await strategy.callStatic.syncBalance();
            expect(strategyBalanceAfterHarvest.gte(strategyBalanceAfterUncommit)).to.be.true;
            console.log(
                `Strategy ${supplyTokenSymbol} balance after harvest:`,
                formatUnits(strategyBalanceAfterHarvest, supplyTokenDecimals)
            );
        }
    } catch (e) {
        console.log('Cannot harvest: ', e);
    }
}