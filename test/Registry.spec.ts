import { expect } from 'chai';

import { Wallet } from '@ethersproject/wallet';

import { deployContracts, loadFixture } from './common';

describe('Registry', function () {
  async function fixture([admin]: Wallet[]) {
    const { registry, strategyDummy, testERC20 } = await deployContracts(admin);
    return {
      registry,
      strategyDummy,
      testERC20
    };
  }

  it('should register asset', async function () {
    const { registry, testERC20 } = await loadFixture(fixture);
    const tokenAddress = testERC20.address;
    expect(await registry.registerAsset(tokenAddress)).to.not.throw;
    expect(await registry.assetAddressToIndex(tokenAddress)).to.equal(1); // 0 is reserved
    expect(await registry.assetIndexToAddress(1)).to.equal(tokenAddress);
  });

  it('should register strategy', async function () {
    const { registry, strategyDummy } = await loadFixture(fixture);
    const stAddress = strategyDummy.address;
    expect(await registry.registerStrategy(stAddress)).to.not.throw;
    expect(await registry.strategyAddressToIndex(stAddress)).to.equal(1); // 0 is reserved
    expect(await registry.strategyIndexToAddress(1)).to.equal(stAddress);
  });
});
