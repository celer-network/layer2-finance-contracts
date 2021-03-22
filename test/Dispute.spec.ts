import { expect } from 'chai';
import fs from 'fs';
import { ethers } from 'hardhat';

import { Wallet } from '@ethersproject/wallet';

import { deployContracts, loadFixture } from './common';

const USER_NUM = 3;
const USER_KEY_1 = '0x36f2243a51a0f879b1859fff1a663ac04aeebca1bcff4d7dc5a8b38e53211199';
const USER_KEY_2 = '0xc0bf10873ddb6d554838f5e4f0c000e85d3307754151add9813ff331b746390d';
const USER_KEY_3 = '0x68888cc706520c4d5049d38933e0b502e2863781d75de09c499cf0e4e00ba2de';
const DISPUTE_METHOD_SIG = '0x8bdc6232';

describe('Dispute', function () {
  async function fixture([admin]: Wallet[]) {
    const { registry, rollupChain, strategyDummy, testERC20 } = await deployContracts(admin);

    const tokenAddress = testERC20.address;
    await registry.registerAsset(tokenAddress);

    await rollupChain.setNetDepositLimit(tokenAddress, ethers.utils.parseEther('10000'));
    await rollupChain.setBlockChallengePeriod(10);

    const users = [
      new ethers.Wallet(USER_KEY_1).connect(ethers.provider),
      new ethers.Wallet(USER_KEY_2).connect(ethers.provider),
      new ethers.Wallet(USER_KEY_3).connect(ethers.provider)
    ];

    for (var i = 0; i < USER_NUM; i++) {
      await admin.sendTransaction({
        to: users[i].address,
        value: ethers.utils.parseEther('10')
      });
      await testERC20.transfer(users[i].address, ethers.utils.parseEther('10000'));
    }
    const stAddress = strategyDummy.address;
    await registry.registerStrategy(stAddress);

    return {
      admin,
      registry,
      rollupChain,
      strategyDummy,
      testERC20,
      users
    };
  }

  it('should dispute successfully for invalid state root', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs.readFileSync('test/dispute-data/deposit-root-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG + fs.readFileSync('test/dispute-data/deposit-root-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0, 'invalid post-state root');
  });

  it('should dispute successfully for invalid account id mapping', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs.readFileSync('test/dispute-data/deposit-acctid-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG + fs.readFileSync('test/dispute-data/deposit-acctid-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0, 'invalid account id');
  });

  it('should dispute successfully for invalid state root of first deposit of an account', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs.readFileSync('test/dispute-data/deposit-create-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG + fs.readFileSync('test/dispute-data/deposit-create-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await testERC20.connect(users[1]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[1]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0, 'invalid post-state root');
  });

  it('should fail to dispute valid deposit transition', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs.readFileSync('test/dispute-data/deposit-valid-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG + fs.readFileSync('test/dispute-data/deposit-valid-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    ).to.be.revertedWith('Failed to dispute');
  });

  it('should fail to dispute valid deposit after init transition', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs
      .readFileSync('test/dispute-data/init-deposit-valid-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/init-deposit-valid-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    ).to.be.revertedWith('Failed to dispute');
  });

  it('should dispute successfully for invalid deposit after init transition', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs
      .readFileSync('test/dispute-data/init-deposit-invalid-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/init-deposit-invalid-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0, 'invalid post-state root');
  });

  it('should fail to dispute valid init transition', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs.readFileSync('test/dispute-data/init-valid-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG + fs.readFileSync('test/dispute-data/init-valid-pf').toString().trim();

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    ).to.be.revertedWith('Failed to dispute');
  });

  it('should dispute successfully invalid init transition', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs.readFileSync('test/dispute-data/init-invalid-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG + fs.readFileSync('test/dispute-data/init-invalid-pf').toString().trim();

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0, 'invalid init transition');
  });

  it('should dispute successfully for commit transition with invalid amount', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs.readFileSync('test/dispute-data/commit-amt-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG + fs.readFileSync('test/dispute-data/commit-amt-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0, 'failed to evaluate');
  });

  it('should dispute successfully for commit transition with invalid signature', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs.readFileSync('test/dispute-data/commit-sig-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG + fs.readFileSync('test/dispute-data/commit-sig-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0, 'failed to evaluate');
  });

  it('should fail to dispute valid commit transition', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs.readFileSync('test/dispute-data/commit-valid-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG + fs.readFileSync('test/dispute-data/commit-valid-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    ).to.be.revertedWith('Failed to dispute');
  });

  it('should dispute successfully for withdraw transition with invalid amount', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs.readFileSync('test/dispute-data/withdraw-amt-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG + fs.readFileSync('test/dispute-data/withdraw-amt-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0, 'failed to evaluate');
  });

  it('should fail to dispute valid withdraw transition', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs.readFileSync('test/dispute-data/withdraw-valid-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG + fs.readFileSync('test/dispute-data/withdraw-valid-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    ).to.be.revertedWith('Failed to dispute');
  });

  it('should fail to dispute past challenge period', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs.readFileSync('test/dispute-data/deposit-root-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG + fs.readFileSync('test/dispute-data/deposit-root-pf').toString().trim();

    await rollupChain.setBlockChallengePeriod(0);

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tnData);
    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    ).to.be.revertedWith('Block challenge period is over');
  });

  it('should fail to dispute with invalid empty input', async function () {
    const { rollupChain, testERC20, users } = await loadFixture(fixture);
    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const tnData = fs.readFileSync('test/dispute-data/deposit-root-tn').toString().split('\n');
    await rollupChain.commitBlock(0, tnData);

    await expect(
      rollupChain.disputeTransition(
        {
          transition: '0x00',
          blockId: 0,
          index: 0,
          siblings: ['0x0000000000000000000000000000000000000000000000000000000000000000']
        },
        {
          transition: '0x00',
          blockId: 0,
          index: 0,
          siblings: ['0x0000000000000000000000000000000000000000000000000000000000000000']
        },
        {
          stateRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
          value: {
            account: users[0].address,
            accountId: 0,
            idleAssets: [0],
            stTokens: [0],
            timestamp: 0
          },
          index: 0,
          siblings: ['0x0000000000000000000000000000000000000000000000000000000000000000']
        },
        {
          stateRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
          value: {
            assetId: 0,
            assetBalance: 0,
            stTokenSupply: 0,
            pendingCommitAmount: 0,
            pendingUncommitAmount: 0
          },
          index: 0,
          siblings: ['0x0000000000000000000000000000000000000000000000000000000000000000']
        }
      )
    ).to.be.revertedWith('Failed to dispute');
  });
});
