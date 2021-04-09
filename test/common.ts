import { Fixture } from 'ethereum-waffle';
import { ethers, waffle } from 'hardhat';

import { parseEther } from '@ethersproject/units';
import { Wallet } from '@ethersproject/wallet';

import { Registry__factory } from '../typechain';
import { RollupChain__factory } from '../typechain/factories/RollupChain__factory';
import { StrategyDummy__factory } from '../typechain/factories/StrategyDummy__factory';
import { TestERC20__factory } from '../typechain/factories/TestERC20__factory';
import { TransitionDisputer__factory } from '../typechain/factories/TransitionDisputer__factory';
import { TransitionEvaluator__factory } from '../typechain/factories/TransitionEvaluator__factory';
import { WETH9__factory } from '../typechain/factories/WETH9__factory';
import { Registry } from '../typechain/Registry.d';
import { RollupChain } from '../typechain/RollupChain.d';
import { StrategyDummy } from '../typechain/StrategyDummy.d';
import { TestERC20 } from '../typechain/TestERC20';
import { WETH9 } from '../typechain/WETH9.d';

const userPrivKeys = [
  '0x36f2243a51a0f879b1859fff1a663ac04aeebca1bcff4d7dc5a8b38e53211199',
  '0xc0bf10873ddb6d554838f5e4f0c000e85d3307754151add9813ff331b746390d',
  '0x68888cc706520c4d5049d38933e0b502e2863781d75de09c499cf0e4e00ba2de',
  '0x400e64f3b8fe65ecda0bad60627c41fa607172cf0970fbe2551d6d923fd82f78',
  '0xab4c840e48b11840f923a371ba453e4d8884fd23eee1b579f5a3910c9b00a4b6',
  '0x0168ea2aa71023864b1c8eb65997996d726e5068c12b20dea81076ef56380465'
];

// Workaround for https://github.com/nomiclabs/hardhat/issues/849
// TODO: Remove once fixed upstream.
export function loadFixture<T>(fixture: Fixture<T>): Promise<T> {
  const provider = waffle.provider;
  return waffle.createFixtureLoader(provider.getWallets(), provider)(fixture);
}

interface DeploymentInfo {
  admin: Wallet;
  registry: Registry;
  rollupChain: RollupChain;
  strategyDummy: StrategyDummy;
  strategyWeth: StrategyDummy;
  testERC20: TestERC20;
  weth: WETH9;
}

export async function deployContracts(admin: Wallet): Promise<DeploymentInfo> {
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

  const rollupChainFactory = (await ethers.getContractFactory('RollupChain')) as RollupChain__factory;
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
  await weth.deposit({ value: parseEther('20') });

  const strategyDummyFactory = (await ethers.getContractFactory('StrategyDummy')) as StrategyDummy__factory;
  const strategyDummy = await strategyDummyFactory.deploy(
    rollupChain.address,
    testERC20.address,
    admin.address,
    parseEther('1')
  );
  await strategyDummy.deployed();
  await testERC20.approve(strategyDummy.address, parseEther('1000'));

  const strategyWeth = await strategyDummyFactory.deploy(
    rollupChain.address,
    weth.address,
    admin.address,
    parseEther('1')
  );
  await strategyWeth.deployed();
  await weth.approve(strategyWeth.address, parseEther('1000'));

  return { admin, registry, rollupChain, strategyDummy, strategyWeth, testERC20, weth };
}

export async function getUsers(admin: Wallet, assets: TestERC20[], num: number): Promise<Wallet[]> {
  const users: Wallet[] = [];
  for (let i = 0; i < num; i++) {
    users.push(new ethers.Wallet(userPrivKeys[i]).connect(ethers.provider));
    await admin.sendTransaction({
      to: users[i].address,
      value: parseEther('10')
    });
    for (let j = 0; j < assets.length; j++) {
      await assets[j].transfer(users[i].address, parseEther('1000'));
    }
  }
  return users;
}

export async function splitTns(tnData: string[]): Promise<string[][]> {
  const tns: string[][] = [];
  tns.push([]);
  let j = 0;
  for (let i = 0; i < tnData.length; i++) {
    if (tnData[i] == '') {
      tns.push([]);
      j++;
    } else {
      tns[j].push(tnData[i]);
    }
  }
  return tns;
}
