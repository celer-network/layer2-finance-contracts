import { expect } from 'chai';

import { Wallet } from '@ethersproject/wallet';

import { deployContracts, loadFixture } from './common';

describe('Admin', function () {
  async function fixture([admin]: Wallet[]) {
    const { registry, rollupChain, testERC20 } = await deployContracts(admin);
    const tokenAddress = testERC20.address;
    await registry.registerAsset(tokenAddress);
    await testERC20.approve(rollupChain.address, 100);
    await rollupChain.setNetDepositLimit(tokenAddress, 100);
    return { admin, registry, rollupChain, testERC20 };
  }

  it('should fail to deposit when paused', async function () {
    const { rollupChain, testERC20 } = await loadFixture(fixture);
    const tokenAddress = testERC20.address;
    await rollupChain.pause();
    await expect(rollupChain.deposit(tokenAddress, 1)).to.be.revertedWith(
      'Pausable: paused'
    );
  });

  it('should fail to deposit when exceed limit', async function () {
    const { rollupChain, testERC20 } = await loadFixture(fixture);
    const tokenAddress = testERC20.address;
    await rollupChain.setNetDepositLimit(tokenAddress, 1);
    await expect(rollupChain.deposit(tokenAddress, 5)).to.be.revertedWith(
      'net deposit exceeds limit'
    );
  });

  it('should fail to drain token when not paused', async function () {
    const { rollupChain, testERC20 } = await loadFixture(fixture);
    const tokenAddress = testERC20.address;
    await rollupChain.deposit(tokenAddress, 10);
    await expect(rollupChain.drainToken(tokenAddress, 10)).to.be.revertedWith(
      'Pausable: not paused'
    );
  });

  it('should drainToken successfully when paused', async function () {
    const { rollupChain, testERC20 } = await loadFixture(fixture);
    const tokenAddress = testERC20.address;
    await rollupChain.deposit(tokenAddress, 10);
    await rollupChain.pause();
    await rollupChain.drainToken(tokenAddress, 10);
  });
});
