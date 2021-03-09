import { expect } from 'chai';

import { deployContracts } from './common';

describe('Admin', function () {
  beforeEach(async function () {
    await deployContracts(this);
    const tokenAddress = this.testERC20.address;
    await this.registry.registerAsset(tokenAddress);
    await this.testERC20.approve(this.rollupChain.address, 100);
    await this.rollupChain.setNetDepositLimit(tokenAddress, 100);
  });

  it('should fail to deposit when paused', async function () {
    const tokenAddress = this.testERC20.address;
    await this.rollupChain.pause();
    await expect(this.rollupChain.deposit(tokenAddress, 1)).to.be.revertedWith(
      'Pausable: paused'
    );
  });

  it('should fail to deposit when exceed limit', async function () {
    const tokenAddress = this.testERC20.address;
    await this.rollupChain.setNetDepositLimit(tokenAddress, 1);
    await expect(this.rollupChain.deposit(tokenAddress, 5)).to.be.revertedWith(
      'net deposit exceeds limit'
    );
  });

  it('should fail to drain token when not paused', async function () {
    const tokenAddress = this.testERC20.address;
    await this.rollupChain.deposit(tokenAddress, 10);
    await expect(
      this.rollupChain.drainToken(tokenAddress, 10, this.adminSigner.address)
    ).to.be.revertedWith('Pausable: not paused');
  });

  it('should drainToken successfully when paused', async function () {
    const tokenAddress = this.testERC20.address;
    await this.rollupChain.deposit(tokenAddress, 10);
    await this.rollupChain.pause();
    await this.rollupChain.drainToken(
      tokenAddress,
      10,
      this.adminSigner.address
    );
  });
});
