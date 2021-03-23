import { Fixture } from 'ethereum-waffle';
import { ethers, waffle } from 'hardhat';

import { Wallet } from '@ethersproject/wallet';

import { Registry__factory } from '../typechain';
import { RollupChain__factory } from '../typechain/factories/RollupChain__factory';
import { StrategyDummy__factory } from '../typechain/factories/StrategyDummy__factory';
import { TestERC20__factory } from '../typechain/factories/TestERC20__factory';
import { TransitionDisputer__factory } from '../typechain/factories/TransitionDisputer__factory';
import { TransitionEvaluator__factory } from '../typechain/factories/TransitionEvaluator__factory';
import { WETH9__factory } from '../typechain/factories/WETH9__factory';

// Workaround for https://github.com/nomiclabs/hardhat/issues/849
// TODO: Remove once fixed upstream.
export function loadFixture<T>(fixture: Fixture<T>): Promise<T> {
  const provider = waffle.provider;
  return waffle.createFixtureLoader(provider.getWallets(), provider)(fixture);
}

export async function deployContracts(admin: Wallet) {
  const registryFactory = (await ethers.getContractFactory('Registry')) as Registry__factory;
  const registry = await registryFactory.deploy();
  await registry.deployed();

  const transitionEvaluatorFactory = (await ethers.getContractFactory(
    'TransitionEvaluator'
  )) as TransitionEvaluator__factory;
  const transitionEvaluator = await transitionEvaluatorFactory.deploy();
  await transitionEvaluator.deployed();

  const transitionDisputerFactory = (await ethers.getContractFactory(
    'TransitionDisputer'
  )) as TransitionDisputer__factory;
  const transitionDisputer = await transitionDisputerFactory.deploy(transitionEvaluator.address);
  await transitionDisputer.deployed();

  const rollupChainFactory = (await ethers.getContractFactory(
    'RollupChain'
  )) as RollupChain__factory;
  const rollupChain = await rollupChainFactory.deploy(
    0,
    0,
    transitionDisputer.address,
    registry.address,
    admin.address
  );
  await rollupChain.deployed();

  const testERC20Factory = (await ethers.getContractFactory('TestERC20')) as TestERC20__factory;
  const testERC20 = await testERC20Factory.deploy();
  await testERC20.deployed();

  const wethFactory = (await ethers.getContractFactory('WETH9')) as WETH9__factory;
  const weth = await wethFactory.deploy();
  await weth.deployed();

  const strategyDummyFactory = (await ethers.getContractFactory(
    'StrategyDummy'
  )) as StrategyDummy__factory;
  const strategyDummy = await strategyDummyFactory.deploy(
    rollupChain.address,
    testERC20.address,
    admin.address,
    ethers.utils.parseEther('1')
  );
  await strategyDummy.deployed();
  await testERC20.approve(strategyDummy.address, ethers.utils.parseEther('1000'));

  const strategyWeth = await strategyDummyFactory.deploy(
    rollupChain.address,
    weth.address,
    admin.address,
    ethers.utils.parseEther('1')
  );
  await weth.approve(strategyDummy.address, ethers.utils.parseEther('1000'));

  return { admin, registry, rollupChain, strategyDummy, strategyWeth, testERC20, weth };
}
