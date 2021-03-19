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
      new ethers.Wallet(USER_KEY_3).connect(ethers.provider)];

    for (var i = 0; i < USER_NUM; i++) {
      await admin.sendTransaction({
        to: users[i].address,
        value: ethers.utils.parseEther('10')
      });
      await testERC20.transfer(users[i].address, ethers.utils.parseEther('10000'));
    }


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
    const {
      admin,
      rollupChain,
      testERC20,
      users
    } = await loadFixture(fixture);
    const disputeSuccessData =
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
      '0x00000000000000000000000000000000000000000000000000000000000000019fb5a689aebc1bd3284518a480af0976f2c8d5048e32fd3c249352ab8af11b88000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit
      '0x000000000000000000000000000000000000000000000000000000000000000387e6eb5e4a8720b8cba0195e2ce5341d70a0df0ddbd81648897c954fd242bcf0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000412dfd0ec493f9f8125b4d2f5d7b56db8d43abfe9df5ce6da3d6343c39c48d8c102a088a80d95bb5dedeb3905472a0dc320f372e9c7a028fc1003b640e3f183b140000000000000000000000000000000000000000000000000000000000000000',
      // Deposit (bad)
      '0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000062616420737461746520726f6f74000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000'
    ];
    await rollupChain.commitBlock(0, txs);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeSuccessData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0);
  });

  it('should dispute successfully for invalid account id mapping', async function () {
    const {
      admin,
      rollupChain,
      testERC20,
      users
    } = await loadFixture(fixture);
    const disputeSuccessData =
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
      '0x00000000000000000000000000000000000000000000000000000000000000010071cbf8ea36415996e331fd50d10dd2aa8cc2bde30e4012f9adf88884dcf3c7000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Deposit to the same user again, but mapped to another id
      '0x0000000000000000000000000000000000000000000000000000000000000001c03d7959844a87fbdd29772d3d415492ee70d83f0d706ed57ca55da0f4720579000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
    ];
    await rollupChain.commitBlock(0, txs);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeSuccessData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0);
  });
  
  it('should dispute successfully for invalid state root of first deposit of an account', async function () {
    const {
      admin,
      rollupChain,
      testERC20,
      users
    } = await loadFixture(fixture);
    const disputeSuccessData =
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
      '0x00000000000000000000000000000000000000000000000000000000000000010071cbf8ea36415996e331fd50d10dd2aa8cc2bde30e4012f9adf88884dcf3c7000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Deposit accnt 2 (bad)
      '0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000062616420737461746520726f6f74000000000000000000000000c22c304660d5f1d2a7a459ceefc0c2cb30f5cfe4000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
    ];
    await rollupChain.commitBlock(0, txs);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeSuccessData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0);
  });

  it('should dispute successfully for commit transition with invalid amount', async function () {
    const {
      admin,
      rollupChain,
      testERC20,
      users
    } = await loadFixture(fixture);
    const disputeSuccessData =
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
      '0x00000000000000000000000000000000000000000000000000000000000000019fb5a689aebc1bd3284518a480af0976f2c8d5048e32fd3c249352ab8af11b88000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit 1e18
      '0x000000000000000000000000000000000000000000000000000000000000000387e6eb5e4a8720b8cba0195e2ce5341d70a0df0ddbd81648897c954fd242bcf0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000417cfdd37eccf7b5f43a8cbefb375bc371756691d4fbe3031e0c0622d2118265e735e5acea6c6c07eedd0a825d23e56ce65f1c8ad88b8e3eface09efeb4d8188890000000000000000000000000000000000000000000000000000000000000000',
      // Commit 1e18, not enough balance
      '0x00000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000c800000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000415b6af1d3ad182b9325a8f2bf18b15ae4a8e6b20d16acd456ed9ac2e633fd1ecc0c4c65ba71d10e5b121625f85d051acfd4ab6fbf01d013157ed2907509091b220000000000000000000000000000000000000000000000000000000000000000'
    ];
    await rollupChain.commitBlock(0, txs);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeSuccessData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0);
  });

  it('should dispute successfully for commit transition with invalid signature', async function () {
    const {
      admin,
      rollupChain,
      testERC20,
      users
    } = await loadFixture(fixture);
    const disputeSuccessData =
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
      '0x00000000000000000000000000000000000000000000000000000000000000019fb5a689aebc1bd3284518a480af0976f2c8d5048e32fd3c249352ab8af11b88000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit, invalid sig
      '0x000000000000000000000000000000000000000000000000000000000000000387e6eb5e4a8720b8cba0195e2ce5341d70a0df0ddbd81648897c954fd242bcf0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000076261642073696700000000000000000000000000000000000000000000000000',
    ];
    await rollupChain.commitBlock(0, txs);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeSuccessData
      })
    )
      .to.emit(rollupChain, 'RollupBlockReverted')
      .withArgs(0);
  });

  it('should fail to dispute past challenge period', async function () {
    const {
      admin,
      rollupChain,
      testERC20,
      users
    } = await loadFixture(fixture);
    const disputeSuccessData =
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
      '0x00000000000000000000000000000000000000000000000000000000000000019fb5a689aebc1bd3284518a480af0976f2c8d5048e32fd3c249352ab8af11b88000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit
      '0x000000000000000000000000000000000000000000000000000000000000000387e6eb5e4a8720b8cba0195e2ce5341d70a0df0ddbd81648897c954fd242bcf0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000412dfd0ec493f9f8125b4d2f5d7b56db8d43abfe9df5ce6da3d6343c39c48d8c102a088a80d95bb5dedeb3905472a0dc320f372e9c7a028fc1003b640e3f183b140000000000000000000000000000000000000000000000000000000000000000',
      // Deposit (invalid root)
      '0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000062616420737461746520726f6f74000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000'
    ];
    await rollupChain.commitBlock(0, txs);

    await expect(
      admin.sendTransaction({
        to: rollupChain.address,
        data: disputeSuccessData
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
      '0x00000000000000000000000000000000000000000000000000000000000000019fb5a689aebc1bd3284518a480af0976f2c8d5048e32fd3c249352ab8af11b88000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
      // Commit
      '0x000000000000000000000000000000000000000000000000000000000000000387e6eb5e4a8720b8cba0195e2ce5341d70a0df0ddbd81648897c954fd242bcf0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000412dfd0ec493f9f8125b4d2f5d7b56db8d43abfe9df5ce6da3d6343c39c48d8c102a088a80d95bb5dedeb3905472a0dc320f372e9c7a028fc1003b640e3f183b140000000000000000000000000000000000000000000000000000000000000000',
      // Deposit (bad)
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
