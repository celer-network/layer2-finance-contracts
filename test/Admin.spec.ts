import { expect } from 'chai';
import { ethers } from 'hardhat';

import { parseEther } from '@ethersproject/units';
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
    await expect(rollupChain.deposit(tokenAddress, 1)).to.be.revertedWith('Pausable: paused');
  });

  it('should fail to deposit when exceed limit', async function () {
    const { rollupChain, testERC20 } = await loadFixture(fixture);
    const tokenAddress = testERC20.address;
    await rollupChain.setNetDepositLimit(tokenAddress, 1);
    await expect(rollupChain.deposit(tokenAddress, 5)).to.be.revertedWith('net deposit exceeds limit');
  });

  it('should fail to drain token when not paused', async function () {
    const { rollupChain, testERC20 } = await loadFixture(fixture);
    const tokenAddress = testERC20.address;
    await rollupChain.deposit(tokenAddress, 10);
    await expect(rollupChain.drainToken(tokenAddress, 10)).to.be.revertedWith('Pausable: not paused');
  });

  it('should drainToken successfully when paused', async function () {
    const { admin, rollupChain, testERC20 } = await loadFixture(fixture);
    const tokenAddress = testERC20.address;
    await rollupChain.deposit(tokenAddress, 10);
    await rollupChain.pause();

    const balanceBefore = await testERC20.balanceOf(admin.address);
    expect(await rollupChain.drainToken(tokenAddress, 10)).to.not.throw;
    const balanceAfter = await testERC20.balanceOf(admin.address);
    expect(balanceAfter.sub(balanceBefore)).to.equal(10);
  });

  it('should fail to drain ETH when not paused', async function () {
    const { admin, rollupChain } = await loadFixture(fixture);
    await admin.sendTransaction({
      to: rollupChain.address,
      value: parseEther('1.0')
    });
    await expect(rollupChain.drainETH(10)).to.be.revertedWith('Pausable: not paused');
  });

  it('should drain ETH successfully when paused', async function () {
    const { admin, rollupChain } = await loadFixture(fixture);
    await admin.sendTransaction({
      to: rollupChain.address,
      value: parseEther('1.0')
    });
    await rollupChain.pause();

    const balanceBefore = await ethers.provider.getBalance(admin.address);
    const drainTx = await rollupChain.drainETH(10);
    expect(drainTx).to.not.throw;
    const gasSpent = (await drainTx.wait()).gasUsed.mul(drainTx.gasPrice);
    const balanceAfter = await ethers.provider.getBalance(admin.address);
    expect(balanceAfter.sub(balanceBefore).add(gasSpent)).to.equal(10);
  });
});
