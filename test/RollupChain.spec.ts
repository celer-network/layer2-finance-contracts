import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployContracts } from './common';

describe('RollupChain', function () {
  beforeEach(async function () {
    await deployContracts(this);
  });

  it('should deposit', async function () {
    const tokenAddress = this.testERC20.address;
    await this.registry.registerAsset(tokenAddress);
    await this.testERC20.approve(
      this.rollupChain.address,
      ethers.utils.parseEther('1')
    );
    await expect(
      this.rollupChain.deposit(tokenAddress, ethers.utils.parseEther('1'))
    )
      .to.emit(this.rollupChain, 'AssetDeposited')
      .withArgs(this.adminSigner.address, 1, ethers.utils.parseEther('1'), 0);
    const [
      account,
      assetID,
      amount,
      blockID,
      status
    ] = await this.rollupChain.pendingDeposits(0);
    expect(account).to.equal(this.adminSigner.address);
    expect(assetID).to.equal(1);
    expect(amount).to.equal(ethers.utils.parseEther('1'));
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);
  });

  it('should commit block', async function () {
    // TODO: generate test data more programmatically
    const txs = [
      '0x000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000737461746520726f6f740000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000001020300000000000000000000000000000000000000000000000000000000000102030000000000000000000000000000000000000000000000000000000000010203',
      '0x000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000737461746520726f6f7400000000000000000000000000000000000000000000000000000000000012340000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000102030000000000000000000000000000000000000000000000000000000000bc614e0000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000d7468697320697320612073696700000000000000000000000000000000000000',
      '0x000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000737461746520726f6f740000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000102030000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000d7468697320697320612073696700000000000000000000000000000000000000',
      '0x000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000737461746520726f6f740000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000102030000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000d7468697320697320612073696700000000000000000000000000000000000000'
    ];
    expect(await this.rollupChain.commitBlock(0, txs)).to.not.throw;
    expect(await this.rollupChain.getCurrentBlockNumber()).to.equal(0); // 0-based indexing
  });

  it('should execute block with one deposit, one commit, one sync commitment and one sync balance', async function () {
    const tokenAddress = this.testERC20.address;
    await this.registry.registerAsset(tokenAddress);
    const stAddress = this.strategyDummy.address;
    await this.registry.registerStrategy(stAddress);
    await this.testERC20.approve(
      this.rollupChain.address,
      ethers.utils.parseEther('1')
    );
    await this.testERC20.approve(
      this.strategyDummy.address,
      ethers.utils.parseEther('1')
    );
    await this.rollupChain.deposit(tokenAddress, ethers.utils.parseEther('1'));
    await this.strategyDummy.updateBalance();
    await this.rollupChain.syncBalance(1);

    let [
      strategyID,
      delta,
      blockID,
      status
    ] = await this.rollupChain.pendingBalanceSyncs(0);
    expect(strategyID).to.equal(1);
    expect(delta).to.equal(ethers.utils.parseEther('1'));
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);
    expect(await this.strategyDummy.getBalance()).to.equal(
      ethers.utils.parseEther('1')
    );

    const txs = [
      // Deposit
      '0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit
      '0x000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000737461746520726f6f74000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000d7468697320697320612073696700000000000000000000000000000000000000',
      // Sync commitment
      '0x000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000737461746520726f6f7400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000000',
      // Sync balance
      '0x000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000737461746520726f6f7400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000'
    ];
    await this.rollupChain.commitBlock(0, txs);
    const intents = [
      // Sync commitment
      '0x000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000737461746520726f6f7400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000000'
    ];
    expect(await this.rollupChain.executeBlock(intents)).to.not.throw;

    // Check fund committed
    expect(await this.strategyDummy.getBalance()).to.equal(
      ethers.utils.parseEther('2')
    );

    // Check pending deposit cleared
    let account, assetID, amount;
    [
      account,
      assetID,
      amount,
      blockID,
      status
    ] = await this.rollupChain.pendingDeposits(0);
    expect(account).to.equal(ethers.constants.AddressZero);
    expect(assetID).to.equal(0);
    expect(amount).to.equal(0);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    // Check pending balance sync cleared
    [
      strategyID,
      delta,
      blockID,
      status
    ] = await this.rollupChain.pendingBalanceSyncs(0);
    expect(strategyID).to.equal(0);
    expect(delta).to.equal(0);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);
  });
});
