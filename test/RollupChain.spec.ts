import { expect } from 'chai';
import { ethers } from 'hardhat';
import fs from 'fs';

import { Wallet } from '@ethersproject/wallet';

import { deployContracts, getUsers, splitTns, loadFixture } from './common';

const parseEther = ethers.utils.parseEther;

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

    await rollupChain.setNetDepositLimit(tokenAddress, parseEther('10000'));
    await rollupChain.setNetDepositLimit(wethAddress, parseEther('10000'));

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
    const users = await getUsers(admin, [testERC20], 1);
    const tokenAddress = testERC20.address;
    const depositAmount = parseEther('1');
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

    const withdrawAmount = parseEther('1');
    await expect(
      rollupChain.connect(users[0]).withdraw(users[0].address, tokenAddress)
    ).to.be.revertedWith('Nothing to withdraw');

    const txs = fs.readFileSync('test/input/data/rollup/dep-wd-tk1-tn').toString().split('\n');
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
    const users = await getUsers(admin, [], 1);
    const wethAddress = weth.address;
    const depositAmount = parseEther('1');
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

    const txs = fs.readFileSync('test/input/data/rollup/dep-wd-tk2-tn').toString().split('\n');
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

  it('should commit and execute blocks with sync commitment transitions', async function () {
    const {
      admin,
      registry,
      rollupChain,
      strategyDummy,
      strategyWeth,
      testERC20,
      weth
    } = await loadFixture(fixture);
    await registry.registerStrategy(strategyDummy.address);
    await registry.registerStrategy(strategyWeth.address);

    const users = await getUsers(admin, [testERC20], 1);
    await testERC20.connect(users[0]).approve(rollupChain.address, parseEther('4'));
    await rollupChain.connect(users[0]).deposit(testERC20.address, parseEther('4'));
    await rollupChain.connect(users[0]).depositETH(weth.address, parseEther('4'), {
      value: parseEther('4')
    });

    const tnData = fs.readFileSync('test/input/data/rollup/sync-commit-tn').toString().split('\n');
    const tns = await splitTns(tnData);

    await rollupChain.commitBlock(0, tns[0]);
    let intents = [tns[0][4], tns[0][7]];
    expect(await rollupChain.executeBlock(intents))
      .to.emit(rollupChain, 'RollupBlockExecuted')
      .withArgs(0);

    expect(await strategyDummy.getBalance()).to.equal(parseEther('2'));
    expect(await strategyWeth.getBalance()).to.equal(parseEther('3'));

    await rollupChain.commitBlock(1, tns[1]);
    intents = [tns[1][3], tns[1][4]];
    await rollupChain.executeBlock(intents);

    expect(await strategyDummy.getBalance()).to.equal(parseEther('1'));
    expect(await strategyWeth.getBalance()).to.equal(parseEther('1'));
  });

  it('should commit and execute blocks with deposit and sync balance transitions', async function () {
    const {
      admin,
      registry,
      rollupChain,
      strategyDummy,
      strategyWeth,
      testERC20,
      weth
    } = await loadFixture(fixture);
    await registry.registerStrategy(strategyDummy.address);
    await registry.registerStrategy(strategyWeth.address);

    const users = await getUsers(admin, [testERC20], 2);
    await testERC20.connect(users[0]).approve(rollupChain.address, parseEther('100'));
    await testERC20.connect(users[1]).approve(rollupChain.address, parseEther('100'));
    await rollupChain.connect(users[0]).deposit(testERC20.address, parseEther('1'));
    await rollupChain.connect(users[1]).depositETH(weth.address, parseEther('2'), {
      value: parseEther('2')
    });
    await rollupChain.connect(users[1]).deposit(testERC20.address, parseEther('3'));
    await rollupChain.connect(users[0]).depositETH(weth.address, parseEther('4'), {
      value: parseEther('4')
    });

    let [account, assetID, amount, blockID, status] = await rollupChain.pendingDeposits(0);
    expect(account).to.equal(users[0].address);
    expect(assetID).to.equal(1);
    expect(amount).to.equal(parseEther('1'));
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    [account, assetID, amount, blockID, status] = await rollupChain.pendingDeposits(1);
    expect(account).to.equal(users[1].address);
    expect(assetID).to.equal(2);
    expect(amount).to.equal(parseEther('2'));
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    [account, assetID, amount, blockID, status] = await rollupChain.pendingDeposits(2);
    expect(account).to.equal(users[1].address);
    expect(assetID).to.equal(1);
    expect(amount).to.equal(parseEther('3'));
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    [account, assetID, amount, blockID, status] = await rollupChain.pendingDeposits(3);
    expect(account).to.equal(users[0].address);
    expect(assetID).to.equal(2);
    expect(amount).to.equal(parseEther('4'));
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    await strategyDummy.harvest();
    await rollupChain.syncBalance(1);
    await strategyDummy.harvest();
    await rollupChain.syncBalance(1);
    await strategyWeth.harvest();
    await strategyWeth.harvest();
    await rollupChain.syncBalance(2);

    let strategyID, delta;
    [strategyID, delta, blockID, status] = await rollupChain.pendingBalanceSyncs(0);
    expect(strategyID).to.equal(1);
    expect(delta).to.equal(parseEther('1'));
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    [strategyID, delta, blockID, status] = await rollupChain.pendingBalanceSyncs(1);
    expect(strategyID).to.equal(1);
    expect(delta).to.equal(parseEther('1'));
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    [strategyID, delta, blockID, status] = await rollupChain.pendingBalanceSyncs(2);
    expect(strategyID).to.equal(2);
    expect(delta).to.equal(parseEther('2'));
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    const tnData = fs.readFileSync('test/input/data/rollup/dep-syncbal-tn').toString().split('\n');
    const tns = await splitTns(tnData);

    await expect(rollupChain.commitBlock(0, tns[1])).to.be.revertedWith(
      'invalid balance sync transition, mismatch or wrong ordering'
    );

    await rollupChain.commitBlock(0, tns[0]);

    [, , , , status] = await rollupChain.pendingDeposits(2);
    expect(status).to.equal(1);
    [, , , , status] = await rollupChain.pendingDeposits(3);
    expect(status).to.equal(0);
    [, , , status] = await rollupChain.pendingBalanceSyncs(0);
    expect(status).to.equal(1);
    [, , , status] = await rollupChain.pendingBalanceSyncs(1);
    expect(status).to.equal(0);

    await rollupChain.commitBlock(1, tns[1]);

    [, , , , status] = await rollupChain.pendingDeposits(3);
    expect(status).to.equal(1);
    [, , , status] = await rollupChain.pendingBalanceSyncs(2);
    expect(status).to.equal(1);

    await expect(rollupChain.executeBlock([]))
      .to.emit(rollupChain, 'RollupBlockExecuted')
      .withArgs(0);

    [account, assetID, amount, blockID, status] = await rollupChain.pendingDeposits(2);
    expect(account).to.equal('0x0000000000000000000000000000000000000000');
    expect(assetID).to.equal(0);
    expect(amount).to.equal(0);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    [account, assetID, amount, blockID, status] = await rollupChain.pendingDeposits(3);
    expect(account).to.equal(users[0].address);
    expect(assetID).to.equal(2);
    expect(amount).to.equal(parseEther('4'));
    expect(blockID).to.equal(1);
    expect(status).to.equal(1);

    [strategyID, delta, blockID, status] = await rollupChain.pendingBalanceSyncs(0);
    expect(strategyID).to.equal(0);
    expect(delta).to.equal(0);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    [strategyID, delta, blockID, status] = await rollupChain.pendingBalanceSyncs(1);
    expect(strategyID).to.equal(1);
    expect(delta).to.equal(parseEther('1'));
    expect(blockID).to.equal(1);
    expect(status).to.equal(1);

    await expect(rollupChain.executeBlock([]))
      .to.emit(rollupChain, 'RollupBlockExecuted')
      .withArgs(1);

    [account, assetID, amount, blockID, status] = await rollupChain.pendingDeposits(3);
    expect(account).to.equal('0x0000000000000000000000000000000000000000');
    expect(assetID).to.equal(0);
    expect(amount).to.equal(0);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);

    [strategyID, delta, blockID, status] = await rollupChain.pendingBalanceSyncs(2);
    expect(strategyID).to.equal(0);
    expect(delta).to.equal(0);
    expect(blockID).to.equal(0);
    expect(status).to.equal(0);
  });
});
