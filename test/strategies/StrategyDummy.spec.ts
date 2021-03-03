import { expect } from 'chai';
import { ethers } from 'hardhat';

import { StrategyDummy__factory } from '../../typechain/factories/StrategyDummy__factory';
import { StrategyDummy } from '../../typechain/StrategyDummy';

declare module 'mocha' {
  export interface Context {
    strategyDummy: StrategyDummy;
  }
}

describe('StrategyDummy', function () {
  beforeEach(async function () {
    const strategyDummyFactory = (await ethers.getContractFactory(
      'StrategyDummy'
    )) as StrategyDummy__factory;
    this.strategyDummy = (await strategyDummyFactory.deploy()) as StrategyDummy;
    await this.strategyDummy.deployed();
  });

  it('should return 1 ether', async function () {
    const oneEther = ethers.utils.parseEther('1');
    expect(await this.strategyDummy.syncBalance()).to.equal(oneEther);
  });
});
