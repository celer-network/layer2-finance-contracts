import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Wallet } from '@ethersproject/wallet';

import { deployContracts, loadFixture } from './common';

describe('RollupChain', function () {
  async function fixture([admin]: Wallet[]) {
    const { registry, rollupChain, strategyDummy, testERC20, weth } = await deployContracts(admin);

    const tokenAddress = testERC20.address;
    const wethAddress = weth.address;
    await registry.registerAsset(tokenAddress);
    await registry.registerAsset(wethAddress);

    await rollupChain.setNetDepositLimit(tokenAddress, ethers.utils.parseEther('10000'));
    await rollupChain.setNetDepositLimit(wethAddress, ethers.utils.parseEther('10000'));

    return {
      admin,
      registry,
      rollupChain,
      strategyDummy,
      testERC20,
      weth
    };
  }

  it('should deposit', async function () {
    const { admin, rollupChain, testERC20 } = await loadFixture(fixture);
    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.approve(rollupChain.address, depositAmount);
    await expect(rollupChain.deposit(tokenAddress, depositAmount))
      .to.emit(rollupChain, 'AssetDeposited')
      .withArgs(admin.address, 1, depositAmount, 0);

    const [account, assetID, amount, blockID, status] = await rollupChain.pendingDeposits(0);
    expect(account).to.equal(admin.address);
    expect(assetID).to.equal(1);
    expect(amount).to.equal(depositAmount);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);
  });

  it('should withdraw', async function () {
    const { admin, rollupChain, testERC20 } = await loadFixture(fixture);
    const tokenAddress = testERC20.address;
    const withdrawAmount = ethers.utils.parseEther('1');
    await testERC20.approve(rollupChain.address, withdrawAmount);
    await rollupChain.deposit(tokenAddress, withdrawAmount);
    await expect(rollupChain.withdraw(admin.address, tokenAddress)).to.be.revertedWith(
      'Nothing to withdraw'
    );

    const txs = [
      // Deposit
      '0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000737461746520726f6f74000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Withdraw
      '0x000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000737461746520726f6f74000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000040ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    ];
    await rollupChain.commitBlock(0, txs);

    let [account, assetID, amount] = await rollupChain.pendingWithdrawCommits(0, 0);
    expect(account).to.equal(admin.address);
    expect(assetID).to.equal(1);
    expect(amount).to.equal(withdrawAmount);

    await rollupChain.executeBlock([]);

    let totalAmount = await rollupChain.pendingWithdraws(admin.address, assetID);
    expect(assetID).to.equal(1);
    expect(totalAmount).to.equal(withdrawAmount);

    const balanceBefore = await testERC20.balanceOf(admin.address);
    await rollupChain.withdraw(admin.address, tokenAddress);
    const balanceAfter = await testERC20.balanceOf(admin.address);
    expect(balanceAfter.sub(balanceBefore)).to.equal(withdrawAmount);
  });

  it('should deposit and withdraw ETH', async function () {
    const { admin, rollupChain, weth } = await loadFixture(fixture);
    const wethAddress = weth.address;
    const depositAmount = ethers.utils.parseEther('1');
    await weth.approve(rollupChain.address, depositAmount);
    await expect(
      rollupChain.depositETH(wethAddress, depositAmount, {
        value: depositAmount
      })
    )
      .to.emit(rollupChain, 'AssetDeposited')
      .withArgs(admin.address, 2, depositAmount, 0);

    let [account, assetID, amount, blockID, status] = await rollupChain.pendingDeposits(0);
    expect(account).to.equal(admin.address);
    expect(assetID).to.equal(2);
    expect(amount).to.equal(depositAmount);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    const txs = [
      // Deposit
      '0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000737461746520726f6f74000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Withdraw
      '0x000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000737461746520726f6f74000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000040ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    ];
    await rollupChain.commitBlock(0, txs);

    [account, assetID, amount] = await rollupChain.pendingWithdrawCommits(0, 0);
    expect(account).to.equal(admin.address);
    expect(assetID).to.equal(2);
    expect(amount).to.equal(depositAmount);

    await rollupChain.executeBlock([]);

    let totalAmount = await rollupChain.pendingWithdraws(admin.address, assetID);
    expect(assetID).to.equal(2);
    expect(totalAmount).to.equal(depositAmount);

    const balanceBefore = await ethers.provider.getBalance(admin.address);
    const withdrawTx = await rollupChain.withdrawETH(admin.address, weth.address);
    const gasSpent = (await withdrawTx.wait()).gasUsed.mul(withdrawTx.gasPrice);
    const balanceAfter = await ethers.provider.getBalance(admin.address);
    expect(balanceAfter.sub(balanceBefore).add(gasSpent)).to.equal(depositAmount);
  });

  it('should commit block', async function () {
    const { rollupChain } = await loadFixture(fixture);
    // TODO: generate test data more programmatically
    const txs = [
      '0x000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000737461746520726f6f740000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000001020300000000000000000000000000000000000000000000000000000000000102030000000000000000000000000000000000000000000000000000000000010203',
      '0x000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000737461746520726f6f7400000000000000000000000000000000000000000000000000000000000012340000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000102030000000000000000000000000000000000000000000000000000000000bc614e0000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000d7468697320697320612073696700000000000000000000000000000000000000',
      '0x000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000737461746520726f6f740000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000102030000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000d7468697320697320612073696700000000000000000000000000000000000000',
      '0x000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000737461746520726f6f740000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000102030000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000d7468697320697320612073696700000000000000000000000000000000000000'
    ];
    await rollupChain.commitBlock(0, txs);
    expect(await rollupChain.getCurrentBlockId()).to.equal(0); // 0-based indexing
  });

  it('should execute block with one deposit, one commit, one sync commitment and one sync balance', async function () {
    const { registry, rollupChain, strategyDummy, testERC20 } = await loadFixture(fixture);
    const tokenAddress = testERC20.address;
    const stAddress = strategyDummy.address;
    await registry.registerStrategy(stAddress);
    await testERC20.approve(rollupChain.address, ethers.utils.parseEther('1'));
    await testERC20.approve(strategyDummy.address, ethers.utils.parseEther('1'));
    await rollupChain.deposit(tokenAddress, ethers.utils.parseEther('1'));
    await strategyDummy.updateBalance();
    await rollupChain.syncBalance(1);

    let [strategyID, delta, blockID, status] = await rollupChain.pendingBalanceSyncs(0);
    expect(strategyID).to.equal(1);
    expect(delta).to.equal(ethers.utils.parseEther('1'));
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);
    expect(await strategyDummy.getBalance()).to.equal(ethers.utils.parseEther('1'));

    const txs = [
      // Deposit
      '0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit
      '0x000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000737461746520726f6f74000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000040ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      // Sync commitment
      '0x000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000737461746520726f6f7400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000000',
      // Sync balance
      '0x000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000737461746520726f6f7400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000'
    ];
    await rollupChain.commitBlock(0, txs);
    const intents = [
      // Sync commitment
      '0x000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000737461746520726f6f7400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000000'
    ];
    await rollupChain.executeBlock(intents);

    // Check fund committed
    expect(await strategyDummy.getBalance()).to.equal(ethers.utils.parseEther('2'));

    // Check pending deposit cleared
    let account, assetID, amount;
    [account, assetID, amount, blockID, status] = await rollupChain.pendingDeposits(0);
    expect(account).to.equal(ethers.constants.AddressZero);
    expect(assetID).to.equal(0);
    expect(amount).to.equal(0);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    // Check pending balance sync cleared
    [strategyID, delta, blockID, status] = await rollupChain.pendingBalanceSyncs(0);
    expect(strategyID).to.equal(0);
    expect(delta).to.equal(0);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);
  });
});
