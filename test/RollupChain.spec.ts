import { expect } from 'chai';
import { ethers } from 'hardhat';
import fs from 'fs';

import { Wallet } from '@ethersproject/wallet';

import { deployContracts, getUsers, loadFixture } from './common';

describe('RollupChain', function () {
  async function fixture([admin]: Wallet[]) {
    const {
      registry,
      rollupChain,
      strategyDummy,
      strategyWeth,
      testERC20,
      weth
    } = await deployContracts(admin);

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
      strategyWeth,
      testERC20,
      weth
    };
  }

  it('should deposit and withdraw ERC20', async function () {
    const { admin, rollupChain, testERC20 } = await loadFixture(fixture);
    const users = await getUsers(admin, [testERC20], 2);
    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount);
    await expect(rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount))
      .to.emit(rollupChain, 'AssetDeposited')
      .withArgs(users[0].address, 1, depositAmount, 0);

    let [account, assetID, amount, blockID, status] = await rollupChain.pendingDeposits(0);
    expect(account).to.equal(users[0].address);
    expect(assetID).to.equal(1);
    expect(amount).to.equal(depositAmount);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    const withdrawAmount = ethers.utils.parseEther('1');
    await expect(
      rollupChain.connect(users[0]).withdraw(users[0].address, tokenAddress)
    ).to.be.revertedWith('Nothing to withdraw');

    const txs = fs.readFileSync('test/input/data/rollup/d-w-1u-a1').toString().split('\n');
    await rollupChain.commitBlock(0, txs);

    [account, assetID, amount] = await rollupChain.pendingWithdrawCommits(0, 0);
    expect(account).to.equal(users[0].address);
    expect(assetID).to.equal(1);
    expect(amount).to.equal(withdrawAmount);

    await rollupChain.executeBlock([]);

    let totalAmount = await rollupChain.pendingWithdraws(users[0].address, assetID);
    expect(assetID).to.equal(1);
    expect(totalAmount).to.equal(withdrawAmount);

    const balanceBefore = await testERC20.balanceOf(users[0].address);
    await rollupChain.withdraw(users[0].address, tokenAddress);
    const balanceAfter = await testERC20.balanceOf(users[0].address);
    expect(balanceAfter.sub(balanceBefore)).to.equal(withdrawAmount);
  });

  it('should deposit and withdraw ETH', async function () {
    const { admin, rollupChain, weth } = await loadFixture(fixture);
    const users = await getUsers(admin, [], 2);
    const wethAddress = weth.address;
    const depositAmount = ethers.utils.parseEther('1');
    await expect(
      rollupChain.connect(users[0]).depositETH(wethAddress, depositAmount, {
        value: depositAmount
      })
    )
      .to.emit(rollupChain, 'AssetDeposited')
      .withArgs(users[0].address, 2, depositAmount, 0);

    let [account, assetID, amount, blockID, status] = await rollupChain.pendingDeposits(0);
    expect(account).to.equal(users[0].address);
    expect(assetID).to.equal(2);
    expect(amount).to.equal(depositAmount);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    const txs = fs.readFileSync('test/input/data/rollup/d-w-1u-a2').toString().split('\n');
    await rollupChain.commitBlock(0, txs);
    expect(await rollupChain.getCurrentBlockId()).to.equal(0);

    [account, assetID, amount] = await rollupChain.pendingWithdrawCommits(0, 0);
    expect(account).to.equal(users[0].address);
    expect(assetID).to.equal(2);
    expect(amount).to.equal(depositAmount);

    await rollupChain.executeBlock([]);

    let totalAmount = await rollupChain.pendingWithdraws(users[0].address, assetID);
    expect(assetID).to.equal(2);
    expect(totalAmount).to.equal(depositAmount);

    const balanceBefore = await ethers.provider.getBalance(users[0].address);
    const withdrawTx = await rollupChain
      .connect(users[0])
      .withdrawETH(users[0].address, weth.address);
    const gasSpent = (await withdrawTx.wait()).gasUsed.mul(withdrawTx.gasPrice);
    const balanceAfter = await ethers.provider.getBalance(users[0].address);
    expect(balanceAfter.sub(balanceBefore).add(gasSpent)).to.equal(depositAmount);
  });

  it('should execute block with sync commitment and sync balance', async function () {
    const { admin, registry, rollupChain, strategyDummy, testERC20 } = await loadFixture(fixture);
    const users = await getUsers(admin, [testERC20], 2);
    const tokenAddress = testERC20.address;
    const stAddress = strategyDummy.address;
    await registry.registerStrategy(stAddress);
    await testERC20.connect(users[0]).approve(rollupChain.address, ethers.utils.parseEther('1'));
    await rollupChain.connect(users[0]).deposit(tokenAddress, ethers.utils.parseEther('1'));
    await strategyDummy.harvest();
    await rollupChain.syncBalance(1);

    let [strategyID, delta, blockID, status] = await rollupChain.pendingBalanceSyncs(0);
    expect(strategyID).to.equal(1);
    expect(delta).to.equal(ethers.utils.parseEther('1'));
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);
    expect(await strategyDummy.getBalance()).to.equal(ethers.utils.parseEther('1'));

    const txs = fs.readFileSync('test/input/data/rollup/d-c-sc-sb').toString().split('\n');
    await rollupChain.commitBlock(0, txs);
    const intents = [txs[2]]; // syncCommitment
    await rollupChain.executeBlock(intents);

    // Check fund committed
    expect(await strategyDummy.getBalance()).to.equal(ethers.utils.parseEther('2'));

    // Check pending balance sync cleared
    [strategyID, delta, blockID, status] = await rollupChain.pendingBalanceSyncs(0);
    expect(strategyID).to.equal(0);
    expect(delta).to.equal(0);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);
  });
});
