import hre, { ethers } from 'hardhat';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { Registry__factory } from '../typechain';
import { MerkleUtils__factory } from '../typechain/factories/MerkleUtils__factory';
import { RollupChain__factory } from '../typechain/factories/RollupChain__factory';
import { StrategyDummy__factory } from '../typechain/factories/StrategyDummy__factory';
import { TestERC20__factory } from '../typechain/factories/TestERC20__factory';
import { TransitionEvaluator__factory } from '../typechain/factories/TransitionEvaluator__factory';
import { Registry } from '../typechain/Registry.d';
import { RollupChain } from '../typechain/RollupChain.d';
import { StrategyDummy } from '../typechain/StrategyDummy.d';
import { TestERC20 } from '../typechain/TestERC20.d';

declare module 'mocha' {
  export interface Context {
    registry: Registry;
    rollupChain: RollupChain;
    strategyDummy: StrategyDummy;
    testERC20: TestERC20;

    adminSigner: SignerWithAddress;
  }
}

export async function initAdminSigner(context: Mocha.Context) {
  const signers: SignerWithAddress[] = await hre.ethers.getSigners();
  context.adminSigner = signers[0];
}

export async function deployContracts(context: Mocha.Context) {
  await initAdminSigner(context);

  const merkleUtilsFactory = (await ethers.getContractFactory(
    'MerkleUtils'
  )) as MerkleUtils__factory;
  const merkleUtils = await merkleUtilsFactory.deploy();
  await merkleUtils.deployed();

  const registryFactory = (await ethers.getContractFactory(
    'Registry'
  )) as Registry__factory;
  context.registry = await registryFactory.deploy();
  await context.registry.deployed();

  const transitionEvaluatorFactory = (await ethers.getContractFactory(
    'TransitionEvaluator'
  )) as TransitionEvaluator__factory;
  const transitionEvaluator = await transitionEvaluatorFactory.deploy(
    context.registry.address
  );
  await transitionEvaluator.deployed();

  const rollupChainFactory = (await ethers.getContractFactory(
    'RollupChain'
  )) as RollupChain__factory;
  context.rollupChain = await rollupChainFactory.deploy(
    0,
    0,
    transitionEvaluator.address,
    merkleUtils.address,
    context.registry.address,
    context.adminSigner.address
  );
  await context.rollupChain.deployed();

  const testERC20Factory = (await ethers.getContractFactory(
    'TestERC20'
  )) as TestERC20__factory;
  context.testERC20 = await testERC20Factory.deploy();
  await context.testERC20.deployed();

  const strategyDummyFactory = (await ethers.getContractFactory(
    'StrategyDummy'
  )) as StrategyDummy__factory;
  context.strategyDummy = await strategyDummyFactory.deploy(
    context.rollupChain.address,
    context.adminSigner.address,
    context.testERC20.address
  );
  await context.strategyDummy.deployed();
}
