import { expect } from 'chai';
import { ethers } from 'hardhat';

import { StrategyDummy } from '../../typechain/StrategyDummy';

describe('StrategyDummy', function () {
  beforeEach(async function () {});

  it('should return 1 ether', async function () {
    const StrategyDummy = await ethers.getContractFactory('StrategyDummy');
    const strategyDummy = (await StrategyDummy.deploy()) as StrategyDummy;

    await strategyDummy.deployed();
    const oneEther = ethers.utils.parseEther('1');
    expect(await strategyDummy.syncBalance()).to.equal(oneEther);
  });
});
