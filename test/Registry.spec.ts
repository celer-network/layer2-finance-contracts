import { expect } from 'chai';

import { deployContracts } from './common';

describe('Registry', function () {
  beforeEach(async function () {
    await deployContracts(this);
  });

  it('should register asset', async function () {
    const tokenAddress = this.testERC20.address;
    expect(await this.registry.registerAsset(tokenAddress)).to.not.throw;
    expect(await this.registry.assetAddressToIndex(tokenAddress)).to.equal(1); // 0 is reserved
    expect(await this.registry.assetIndexToAddress(1)).to.equal(tokenAddress);
  });

  it('should register strategy', async function () {
    const stAddress = this.strategyDummy.address;
    expect(await this.registry.registerStrategy(stAddress)).to.not.throw;
    expect(await this.registry.strategyAddressToIndex(stAddress)).to.equal(1); // 0 is reserved
    expect(await this.registry.strategyIndexToAddress(1)).to.equal(stAddress);
  });
});
