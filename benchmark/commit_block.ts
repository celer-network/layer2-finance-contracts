import '@nomiclabs/hardhat-ethers';

import fs from 'fs';
import { ethers } from 'hardhat';
import path from 'path';

import { Wallet } from '@ethersproject/wallet';

import { deployContracts, loadFixture } from '../test/common';

const GAS_USAGE_DIR = 'reports/gas_usage/';
const GAS_USAGE_LOG = path.join(GAS_USAGE_DIR, 'commit_block.txt');

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
    return {
      admin,
      registry,
      rollupChain,
      strategyDummy,
      testERC20
    };
  }

  async function doBenchmark(txType: string, data: string, maxNum: number) {
    it(
      'one rollup block with up to ' + maxNum + ' ' + txType + ' transitions',
      async function () {
        this.timeout(20000 + 100 * maxNum);

        fs.appendFileSync(GAS_USAGE_LOG, '-- ' + txType + ' --\n');
        for (let numTxs = 1; numTxs <= maxNum; numTxs++) {
          if (numTxs > 100 && numTxs % 100 != 0) {
            continue;
          }
          if (numTxs > 10 && numTxs % 10 != 0) {
            continue;
          }
          const { rollupChain } = await loadFixture(fixture);
          let txs = [];
          for (let i = 0; i < numTxs; i++) {
            txs.push(data);
          }
          const gasUsed = (
            await (
              await rollupChain.commitBlock(0, txs, {
                gasLimit: 9500000 // TODO: Remove once estimateGas() works correctly
              })
            ).wait()
          ).gasUsed;
          fs.appendFileSync(
            GAS_USAGE_LOG,
            numTxs.toString() + '\t' + gasUsed + '\n'
          );
        }
        fs.appendFileSync(GAS_USAGE_LOG, '\n');
      }
    );
  }

  await doBenchmark(
    'sync commitment',
    '0x000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000737461746520726f6f7400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000000',
    10
  );

  await doBenchmark(
    'commit',
    '0x0000000000000000000000000000000000000000000000000000000000000003458739c2752a0b2867beed00d3c326b027ca1488c4cd2ae891d3e1389bbb520f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041a95757e85faeec68494989831f5ff12edc50ca1edc299b538785975ffbb7eed67ff1916cbf7f158ab777680cc7806397d3760d268d065d4cef6621e940dbe0f91b00000000000000000000000000000000000000000000000000000000000000',
    900
  );

  await doBenchmark(
    'withdraw',
    '0x000000000000000000000000000000000000000000000000000000000000000246cde928cfba71c3197dcc1fe276c22245969f476e2debeb1899b68d0e57e4ac000000000000000000000000c1699e89639adda8f39faefc0fc294ee5c3b462d0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000a764000000000000000000000000000000000000000000000000000000000000000000c8000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000411eccdb1668216bc2bf87fc1423ebb2c17db0872436d0ab03cf94cacf9ed0591f5dc07f1a2dd60c9bc7c97ca36a70fb4aa54ee0b5dee681310bfdb70f7824ef681b00000000000000000000000000000000000000000000000000000000000000',
    10
  );
});
