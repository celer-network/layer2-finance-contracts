import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Wallet } from '@ethersproject/wallet';

import { StrategyDummy__factory } from '../../typechain/factories/StrategyDummy__factory';
import { TestERC20__factory } from '../../typechain/factories/TestERC20__factory';
import { loadFixture } from '../common';

describe('StrategyDummy', function () {
  async function fixture([admin]: Wallet[]) {
    const testERC20Factory = (await ethers.getContractFactory('TestERC20')) as TestERC20__factory;
    const testERC20 = await testERC20Factory.deploy();
    await testERC20.deployed();

    const strategyDummyFactory = (await ethers.getContractFactory(
      'StrategyDummy'
    )) as StrategyDummy__factory;
    const strategyDummy = await strategyDummyFactory.deploy(
      admin.address,
      admin.address,
      testERC20.address
    );
    await strategyDummy.deployed();
    return { strategyDummy, testERC20 };
  }

  it('should return asset address', async function () {
    const { strategyDummy, testERC20 } = await loadFixture(fixture);
    expect(await strategyDummy.getAssetAddress()).to.equal(testERC20.address);
  });

  it('should take 1e18 from funder and add to balance', async function () {
    const { strategyDummy, testERC20 } = await loadFixture(fixture);
    await testERC20.approve(strategyDummy.address, ethers.utils.parseEther('1'));
    await strategyDummy.updateBalance();
    expect(await strategyDummy.getBalance()).to.equal(ethers.utils.parseEther('1'));
  });

  it('should aggregate commit', async function () {
    const { strategyDummy, testERC20 } = await loadFixture(fixture);
    await testERC20.approve(strategyDummy.address, ethers.utils.parseEther('2'));
    await strategyDummy.aggregateCommit(ethers.utils.parseEther('1'));
    await strategyDummy.updateBalance();
    expect(await strategyDummy.getBalance()).to.equal(ethers.utils.parseEther('2'));
  });

  it('should aggregate uncommit', async function () {
    const { strategyDummy, testERC20 } = await loadFixture(fixture);
    await testERC20.approve(strategyDummy.address, ethers.utils.parseEther('4'));
    expect(await strategyDummy.aggregateCommit(ethers.utils.parseEther('3'))).to.not.throw;
    await strategyDummy.aggregateUncommit(ethers.utils.parseEther('1'));
    await strategyDummy.updateBalance();
    expect(await strategyDummy.getBalance()).to.equal(ethers.utils.parseEther('3'));
  });
});
