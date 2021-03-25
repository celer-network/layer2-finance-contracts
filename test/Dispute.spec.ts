import { expect } from 'chai';
import fs from 'fs';
import { ethers } from 'hardhat';

import { Wallet } from '@ethersproject/wallet';

import { deployContracts, getUsers, splitTns, loadFixture } from './common';

const DISPUTE_METHOD_SIG = '0x8bdc6232';

describe('Dispute', function () {
  async function fixture([admin]: Wallet[]) {
    const { registry, rollupChain, strategyDummy, testERC20 } = await deployContracts(admin);

    const tokenAddress = testERC20.address;
    await registry.registerAsset(tokenAddress);

    await rollupChain.setNetDepositLimit(tokenAddress, ethers.utils.parseEther('10000'));
    await rollupChain.setBlockChallengePeriod(10);

    const users = await getUsers(admin, [testERC20], 2);
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
    const tnData = fs
      .readFileSync('test/input/data/dispute/deposit-root-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/deposit-root-pf').toString().trim();

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
    const tnData = fs
      .readFileSync('test/input/data/dispute/deposit-acctid-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/deposit-acctid-pf').toString().trim();

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
    const tnData = fs
      .readFileSync('test/input/data/dispute/deposit-create-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/deposit-create-pf').toString().trim();

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
    const tnData = fs
      .readFileSync('test/input/data/dispute/deposit-valid-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/deposit-valid-pf').toString().trim();

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
      .readFileSync('test/input/data/dispute/init-deposit-valid-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/init-deposit-valid-pf').toString().trim();

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
      .readFileSync('test/input/data/dispute/init-deposit-invalid-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/init-deposit-invalid-pf').toString().trim();

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
    const tnData = fs.readFileSync('test/input/data/dispute/init-valid-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/init-valid-pf').toString().trim();

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
    const tnData = fs
      .readFileSync('test/input/data/dispute/init-invalid-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/init-invalid-pf').toString().trim();

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
    const tnData = fs.readFileSync('test/input/data/dispute/commit-amt-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/commit-amt-pf').toString().trim();

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
    const tnData = fs.readFileSync('test/input/data/dispute/commit-sig-tn').toString().split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/commit-sig-pf').toString().trim();

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
    const tnData = fs
      .readFileSync('test/input/data/dispute/commit-valid-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/commit-valid-pf').toString().trim();

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
    const tnData = fs
      .readFileSync('test/input/data/dispute/withdraw-amt-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/withdraw-amt-pf').toString().trim();

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
    const tnData = fs
      .readFileSync('test/input/data/dispute/withdraw-valid-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/withdraw-valid-pf').toString().trim();

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

  it('should dispute successfully for invalid first transition of a second block', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);

    const tnData = fs
      .readFileSync('test/input/data/dispute/2nd-block-invalid-tn')
      .toString()
      .split('\n');
    const {tns1, tns2} = await splitTns(tnData)

    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/2nd-block-invalid-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tns1);
    await rollupChain.commitBlock(1, tns2);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(1, 'invalid post-state root');
  });

  it('should fail to dispute valid first transition of a second block', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);

    const tnData = fs
      .readFileSync('test/input/data/dispute/2nd-block-valid-tn')
      .toString()
      .split('\n');
    const {tns1, tns2} = await splitTns(tnData)

    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/2nd-block-valid-pf').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20.connect(users[0]).approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    await rollupChain.commitBlock(0, tns1);
    await rollupChain.commitBlock(1, tns2);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    ).to.be.revertedWith('Failed to dispute');
  });

  it('should fail to dispute past challenge period', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const tnData = fs
      .readFileSync('test/input/data/dispute/deposit-root-tn')
      .toString()
      .split('\n');
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/input/data/dispute/deposit-root-pf').toString().trim();

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

    const tnData = fs
      .readFileSync('test/input/data/dispute/deposit-root-tn')
      .toString()
      .split('\n');
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
