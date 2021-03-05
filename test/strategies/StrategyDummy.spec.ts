import { expect } from 'chai';
import { ethers } from 'hardhat';

import { StrategyDummy__factory } from '../../typechain/factories/StrategyDummy__factory';
import { TestERC20__factory } from '../../typechain/factories/TestERC20__factory';
import { initAdminSigner } from '../common';

describe('StrategyDummy', function () {
  beforeEach(async function () {
    await initAdminSigner(this);

    const testERC20Factory = (await ethers.getContractFactory(
      'TestERC20'
    )) as TestERC20__factory;
    this.testERC20 = await testERC20Factory.deploy();
    await this.testERC20.deployed();

    const strategyDummyFactory = (await ethers.getContractFactory(
      'StrategyDummy'
    )) as StrategyDummy__factory;
    this.strategyDummy = await strategyDummyFactory.deploy(
      this.adminSigner.address,
      this.adminSigner.address,
      this.testERC20.address
    );
    await this.strategyDummy.deployed();
  });

  it('should return asset address', async function () {
    expect(await this.strategyDummy.getAssetAddress()).to.equal(
      this.testERC20.address
    );
  });

  it('should take 1 from funder and add to balance', async function () {
    await this.testERC20.approve(this.strategyDummy.address, 1);
    expect(await this.strategyDummy.updateBalance()).to.not.throw;
    expect(await this.strategyDummy.getBalance()).to.equal(1);
  });

  it('should sync commit', async function () {
    await this.testERC20.approve(this.strategyDummy.address, 2);
    expect(await this.strategyDummy.syncCommitment(1, 0)).to.not.throw;
    await this.strategyDummy.updateBalance();
    expect(await this.strategyDummy.getBalance()).to.equal(2);
  });

  it('should sync uncommit', async function () {
    await this.testERC20.approve(this.strategyDummy.address, 4);
    expect(await this.strategyDummy.syncCommitment(3, 1)).to.not.throw;
    await this.strategyDummy.updateBalance();
    expect(await this.strategyDummy.getBalance()).to.equal(3);
  });
});
