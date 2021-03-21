import { expect } from 'chai';
import fs from 'fs';
import { ethers } from 'hardhat';

import { Wallet } from '@ethersproject/wallet';

import { deployContracts, loadFixture } from './common';

const USER_NUM = 3;
const USER_KEY_1 =
  '0x36f2243a51a0f879b1859fff1a663ac04aeebca1bcff4d7dc5a8b38e53211199';
const USER_KEY_2 =
  '0xc0bf10873ddb6d554838f5e4f0c000e85d3307754151add9813ff331b746390d';
const USER_KEY_3 =
  '0x68888cc706520c4d5049d38933e0b502e2863781d75de09c499cf0e4e00ba2de';
const DISPUTE_METHOD_SIG = '0x8bdc6232';

describe('Dispute', function () {
  async function fixture([admin]: Wallet[]) {
    const {
      registry,
      rollupChain,
      strategyDummy,
      testERC20
    } = await deployContracts(admin);

    const tokenAddress = testERC20.address;
    await registry.registerAsset(tokenAddress);

    await rollupChain.setNetDepositLimit(
      tokenAddress,
      ethers.utils.parseEther('10000')
    );
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
      await testERC20.transfer(
        users[i].address,
        ethers.utils.parseEther('10000')
      );
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
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/deposit-root.txt').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Deposit
      '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit
      '0x0000000000000000000000000000000000000000000000000000000000000003458739c2752a0b2867beed00d3c326b027ca1488c4cd2ae891d3e1389bbb520f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041a95757e85faeec68494989831f5ff12edc50ca1edc299b538785975ffbb7eed67ff1916cbf7f158ab777680cc7806397d3760d268d065d4cef6621e940dbe0f91b00000000000000000000000000000000000000000000000000000000000000',
      // Deposit (bad)
      '0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000062616420737461746520726f6f74000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000'
    ];
    await rollupChain.commitBlock(0, txs);

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
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/deposit-acctid.txt').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Deposit to one user
      '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Deposit to the same user again, but mapped to another id
      '0x00000000000000000000000000000000000000000000000000000000000000019d4f7879d02d0e8ff7d24573a366890a0f59f233e1448c4dca37e1346417d1c3000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000'
    ];
    await rollupChain.commitBlock(0, txs);

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
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/deposit-create.txt').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await testERC20
      .connect(users[1])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[1]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Deposit accnt 1
      '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Deposit accnt 2 (bad)
      '0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000062616420737461746520726f6f74000000000000000000000000c22c304660d5f1d2a7a459ceefc0c2cb30f5cfe4000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000'
    ];
    await rollupChain.commitBlock(0, txs);

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
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/deposit-valid.txt').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Deposit
      '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit
      '0x0000000000000000000000000000000000000000000000000000000000000003458739c2752a0b2867beed00d3c326b027ca1488c4cd2ae891d3e1389bbb520f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041a95757e85faeec68494989831f5ff12edc50ca1edc299b538785975ffbb7eed67ff1916cbf7f158ab777680cc7806397d3760d268d065d4cef6621e940dbe0f91b00000000000000000000000000000000000000000000000000000000000000',
      // Deposit
      '0x0000000000000000000000000000000000000000000000000000000000000001c2813a39e4f2070b44724bea0576af514c4ce124a05e6751e8d59038da7c52b2000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000'
    ];
    await rollupChain.commitBlock(0, txs);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    ).to.be.revertedWith('Failed to dispute');
  });

  it('should fail to dispute valid deposit after init transition', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/init-deposit-valid.txt').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Init
      '0x0000000000000000000000000000000000000000000000000000000000000007cf277fb80a82478460e8988570b718f1e083ceb76f7e271a1a1497e5975f53ae',
      // Deposit
      '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000'
    ];
    await rollupChain.commitBlock(0, txs);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    ).to.be.revertedWith('Failed to dispute');
  });

  it('should dispute successfully for invalid deposit after init transition', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/init-deposit-invalid.txt').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Init
      '0x0000000000000000000000000000000000000000000000000000000000000007cf277fb80a82478460e8988570b718f1e083ceb76f7e271a1a1497e5975f53ae',
      // Deposit (invalid root)
      '0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000062616420737461746520726f6f74000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000'
    ];
    await rollupChain.commitBlock(0, txs);

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
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/init-valid.txt').toString().trim();

    const txs = [
      // Init
      '0x0000000000000000000000000000000000000000000000000000000000000007cf277fb80a82478460e8988570b718f1e083ceb76f7e271a1a1497e5975f53ae'
    ];
    await rollupChain.commitBlock(0, txs);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    ).to.be.revertedWith('Failed to dispute');
  });

  it('should dispute successfully invalid init transition', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/init-invalid.txt').toString().trim();

    const txs = [
      // Init (invalid)
      '0x000000000000000000000000000000000000000000000000000000000000000700000000000000000000000000000000000062616420737461746520726f6f74'
    ];
    await rollupChain.commitBlock(0, txs);

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
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/commit-amt.txt').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Deposit 1e18
      '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit 1e18
      '0x00000000000000000000000000000000000000000000000000000000000000038f1feddd3737ca44690fe565369c51eebd5af87db412d9c36ab88117ad2486d4000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041bfee7baf0046f3c1f6ce9cf701a0cdef7823b0144daa4b607754c1974720dd0f5033efa6f71e2441792127a4bf36d856b4877c5e2aa6fc7df18c8a026a56f9cc1b00000000000000000000000000000000000000000000000000000000000000',
      // Commit 1e18, not enough balance
      '0x00000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000c800000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000418a0c177af253240b6c8bd462d7b83453204b26271c15a6fac43fa4b93f9431f951a5e769008b155ad211ec944a3d66cb800639c8474be8dfcabb80ef014c4cc41b00000000000000000000000000000000000000000000000000000000000000'
    ];
    await rollupChain.commitBlock(0, txs);

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
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/commit-sig.txt').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Deposit
      '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit, invalid sig
      '0x00000000000000000000000000000000000000000000000000000000000000038f1feddd3737ca44690fe565369c51eebd5af87db412d9c36ab88117ad2486d4000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000076261642073696700000000000000000000000000000000000000000000000000'
    ];
    await rollupChain.commitBlock(0, txs);

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
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/commit-valid.txt').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Deposit
      '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit
      '0x0000000000000000000000000000000000000000000000000000000000000003458739c2752a0b2867beed00d3c326b027ca1488c4cd2ae891d3e1389bbb520f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041a95757e85faeec68494989831f5ff12edc50ca1edc299b538785975ffbb7eed67ff1916cbf7f158ab777680cc7806397d3760d268d065d4cef6621e940dbe0f91b00000000000000000000000000000000000000000000000000000000000000'
    ];
    await rollupChain.commitBlock(0, txs);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    ).to.be.revertedWith('Failed to dispute');
  });

  it('should dispute successfully for withdraw transition with invalid amount', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/withdraw-amt.txt').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Deposit
      '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Withdraw
      '0x00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000001de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000c80000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000004119c7dc7a64c2899b39845bde29455bd62dbe8ca052010008c2ec3e892dc355566b0d65f22f62b2c461449bc5d8846ac170c053396297459db9f5d369b11753491b00000000000000000000000000000000000000000000000000000000000000'
    ];
    await rollupChain.commitBlock(0, txs);

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
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/withdraw-valid.txt').toString().trim();

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Deposit
      '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Withdraw
      '0x000000000000000000000000000000000000000000000000000000000000000246cde928cfba71c3197dcc1fe276c22245969f476e2debeb1899b68d0e57e4ac000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000a764000000000000000000000000000000000000000000000000000000000000000000c8000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000411eccdb1668216bc2bf87fc1423ebb2c17db0872436d0ab03cf94cacf9ed0591f5dc07f1a2dd60c9bc7c97ca36a70fb4aa54ee0b5dee681310bfdb70f7824ef681b00000000000000000000000000000000000000000000000000000000000000'
    ];
    await rollupChain.commitBlock(0, txs);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeData
      })
    ).to.be.revertedWith('Failed to dispute');
  });

  it('should fail to dispute past challenge period', async function () {
    const { admin, rollupChain, testERC20, users } = await loadFixture(fixture);
    const disputeData =
      DISPUTE_METHOD_SIG +
      fs.readFileSync('test/dispute-data/deposit-root.txt').toString().trim();

    await rollupChain.setBlockChallengePeriod(0);

    const tokenAddress = testERC20.address;
    const depositAmount = ethers.utils.parseEther('1');
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Deposit
      '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit
      '0x0000000000000000000000000000000000000000000000000000000000000003458739c2752a0b2867beed00d3c326b027ca1488c4cd2ae891d3e1389bbb520f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041a95757e85faeec68494989831f5ff12edc50ca1edc299b538785975ffbb7eed67ff1916cbf7f158ab777680cc7806397d3760d268d065d4cef6621e940dbe0f91b00000000000000000000000000000000000000000000000000000000000000',
      // Deposit (invalid root)
      '0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000062616420737461746520726f6f74000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000'
    ];
    await rollupChain.commitBlock(0, txs);

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
    await testERC20
      .connect(users[0])
      .approve(rollupChain.address, depositAmount.mul(2));
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);
    await rollupChain.connect(users[0]).deposit(tokenAddress, depositAmount);

    const txs = [
      // Deposit
      '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit
      '0x0000000000000000000000000000000000000000000000000000000000000003458739c2752a0b2867beed00d3c326b027ca1488c4cd2ae891d3e1389bbb520f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041a95757e85faeec68494989831f5ff12edc50ca1edc299b538785975ffbb7eed67ff1916cbf7f158ab777680cc7806397d3760d268d065d4cef6621e940dbe0f91b00000000000000000000000000000000000000000000000000000000000000',
      // Deposit (invalid root)
      '0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000062616420737461746520726f6f74000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000'
    ];
    await rollupChain.commitBlock(0, txs);

    await expect(
      rollupChain.disputeTransition(
        {
          transition: '0x00',
          blockId: 0,
          index: 0,
          siblings: [
            '0x0000000000000000000000000000000000000000000000000000000000000000'
          ]
        },
        {
          transition: '0x00',
          blockId: 0,
          index: 0,
          siblings: [
            '0x0000000000000000000000000000000000000000000000000000000000000000'
          ]
        },
        {
          stateRoot:
            '0x0000000000000000000000000000000000000000000000000000000000000000',
          value: {
            account: users[0].address,
            accountId: 0,
            idleAssets: [0],
            stTokens: [0],
            timestamp: 0
          },
          index: 0,
          siblings: [
            '0x0000000000000000000000000000000000000000000000000000000000000000'
          ]
        },
        {
          stateRoot:
            '0x0000000000000000000000000000000000000000000000000000000000000000',
          value: {
            assetId: 0,
            assetBalance: 0,
            stTokenSupply: 0,
            pendingCommitAmount: 0,
            pendingUncommitAmount: 0
          },
          index: 0,
          siblings: [
            '0x0000000000000000000000000000000000000000000000000000000000000000'
          ]
        }
      )
    ).to.be.revertedWith('Failed to dispute');
  });
});
