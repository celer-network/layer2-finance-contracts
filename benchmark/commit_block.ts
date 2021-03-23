import '@nomiclabs/hardhat-ethers';

import fs from 'fs';
import { ethers } from 'hardhat';
import path from 'path';

import { Wallet } from '@ethersproject/wallet';

import { deployContracts, loadFixture } from '../test/common';

const GAS_USAGE_DIR = 'reports/gas_usage/';
const GAS_USAGE_LOG = path.join(GAS_USAGE_DIR, 'commit_block.txt');

const USER_KEY = '0x36f2243a51a0f879b1859fff1a663ac04aeebca1bcff4d7dc5a8b38e53211199';
const INIT_TX = ['0x000000000000000000000000000000000000000000000000000000000000000700000000000000000000000000000000000062616420737461746520726f6f74'];

describe('Benchmark commitBlock', async function () {
  if (!fs.existsSync(GAS_USAGE_DIR)) {
    fs.mkdirSync(GAS_USAGE_DIR, { recursive: true });
  }
  fs.rmSync(GAS_USAGE_LOG, { force: true });
  fs.appendFileSync(GAS_USAGE_LOG, 'transitions, gas cost per block\n\n');

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

    const user = new ethers.Wallet(USER_KEY).connect(ethers.provider)
    await admin.sendTransaction({
      to: user.address,
      value: ethers.utils.parseEther('10')
    });
    await testERC20.transfer(user.address, ethers.utils.parseEther('10000'));

    return {
      admin,
      registry,
      rollupChain,
      strategyDummy,
      testERC20,
      user
    };
  }

  async function doBenchmark(txType: string, data: string, maxNum: number) {
    it(
      'one rollup block with up to ' + maxNum + ' ' + txType + ' transitions',
      async function () {
        this.timeout(20000 + 100 * maxNum);
        const {registry, rollupChain, strategyDummy, testERC20, user } = await loadFixture(fixture);
        await rollupChain.commitBlock(0, INIT_TX)
        if (txType == 'deposit') {
          const depNum = maxNum * (maxNum+1) / 2 + 1
          await testERC20.connect(user).approve(rollupChain.address, ethers.utils.parseEther('1').mul(depNum));
        } else if (txType == 'sync balance') {
          const stAddress = strategyDummy.address;
          await registry.registerStrategy(stAddress);
        }
        fs.appendFileSync(GAS_USAGE_LOG, '-- ' + txType + ' --\n');
        let blockid = 1
        let firtCost, lastCost
        for (let numTxs = 1; numTxs <= maxNum; numTxs++) {
          if (numTxs > 100 && numTxs % 100 != 0) {
            continue;
          }
          if (numTxs > 10 && numTxs % 10 != 0) {
            continue;
          }
          if (txType == 'deposit') {
            for (let i = 0; i < numTxs; i++) {
              await rollupChain.connect(user).deposit(testERC20.address, ethers.utils.parseEther('1'));
            }
          } else if (txType == 'sync balance') {
            for (let i = 0; i < numTxs; i++) {
              await strategyDummy.harvest();
              await rollupChain.syncBalance(1);
            }
          }

          let txs = [];
          for (let i = 0; i < numTxs; i++) {
            txs.push(data);
          }
          const gasUsed = (
            await (
              await rollupChain.commitBlock(blockid, txs, {
                gasLimit: 9500000 // TODO: Remove once estimateGas() works correctly
              })
            ).wait()
          ).gasUsed;
          if (numTxs == 1) {
            firtCost = gasUsed.toNumber();
          } else if (numTxs == maxNum) {
            lastCost = gasUsed.toNumber();
          }
          blockid++;
          fs.appendFileSync(
            GAS_USAGE_LOG,
            numTxs.toString() + '\t' + gasUsed + '\n'
          );
        }
        const txCost = Math.ceil((Number(lastCost)-Number(firtCost))/(maxNum-1));
        fs.appendFileSync(GAS_USAGE_LOG, 'per tx cost after 1st tn: '+txCost+'\n');
        fs.appendFileSync(GAS_USAGE_LOG, '\n');
      }
    );
  }

  await doBenchmark(
    'sync commitment',
    '0x00000000000000000000000000000000000000000000000000000000000000058a2f39c5085f66e02794285435bc1ae383d839e97c703eaf2c630925f991044b000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000006f05b59d3b2000000000000000000000000000000000000000000000000000003782dace9d90000',
    100
  );

  await doBenchmark(
    'commit',
    '0x0000000000000000000000000000000000000000000000000000000000000003458739c2752a0b2867beed00d3c326b027ca1488c4cd2ae891d3e1389bbb520f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041a95757e85faeec68494989831f5ff12edc50ca1edc299b538785975ffbb7eed67ff1916cbf7f158ab777680cc7806397d3760d268d065d4cef6621e940dbe0f91b00000000000000000000000000000000000000000000000000000000000000',
    900
  );

  await doBenchmark(
    'deposit',
    '0x000000000000000000000000000000000000000000000000000000000000000132ee2db92f5714fac7c7d02cea8f6834273ef2154adf397e61faa2f2a1b3cea6000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
    50
  );

  await doBenchmark(
    'withdraw',
    '0x000000000000000000000000000000000000000000000000000000000000000246cde928cfba71c3197dcc1fe276c22245969f476e2debeb1899b68d0e57e4ac000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000a764000000000000000000000000000000000000000000000000000000000000000000c8000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000411eccdb1668216bc2bf87fc1423ebb2c17db0872436d0ab03cf94cacf9ed0591f5dc07f1a2dd60c9bc7c97ca36a70fb4aa54ee0b5dee681310bfdb70f7824ef681b00000000000000000000000000000000000000000000000000000000000000',
    100
  );

  await doBenchmark(
    'sync balance',
    '0x00000000000000000000000000000000000000000000000000000000000000066d9e25829d575e8b3587a22330ef008bf972648be2fa91be3da3c58d6930d52800000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
    50
  );
});
