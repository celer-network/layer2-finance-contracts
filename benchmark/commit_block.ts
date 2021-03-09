import '@nomiclabs/hardhat-ethers';

import fs from 'fs';
import { ethers } from 'hardhat';
import path from 'path';

import { Wallet } from '@ethersproject/wallet';

import { deployContracts, loadFixture } from '../test/common';

const GAS_USAGE_DIR = 'gas_usage/';
const GAS_USAGE_LOG = path.join(GAS_USAGE_DIR, 'commit_block.txt');

describe('Benchmark commitBlock', async function () {
  if (!fs.existsSync(GAS_USAGE_DIR)) {
    fs.mkdirSync(GAS_USAGE_DIR, { recursive: true });
  }
  fs.rmSync(GAS_USAGE_LOG, { force: true });

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
    it(txType + ' ' + maxNum + ' commit', async function () {
      fs.appendFileSync(GAS_USAGE_LOG, '---- ' + txType + ' ----\n');
      for (let numTxs = 1; numTxs <= maxNum; numTxs++) {
        const { rollupChain } = await loadFixture(fixture);
        let txs = [];
        for (let i = 0; i < numTxs; i++) {
          txs.push(data);
        }
        const gasUsed = (await (await rollupChain.commitBlock(0, txs)).wait())
          .gasUsed;
        fs.appendFileSync(
          GAS_USAGE_LOG,
          numTxs.toString() + '\t' + gasUsed + '\n'
        );
      }
    });
  }

  await doBenchmark(
    'commit',
    '0x000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000737461746520726f6f74000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000bc614e00000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000040ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    5
  );
  await doBenchmark(
    'deposit',
    '0x000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000737461746520726f6f74000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000d7468697320697320612073696700000000000000000000000000000000000000',
    5
  );
  await doBenchmark(
    'sync commitment',
    '0x000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000737461746520726f6f7400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000000',
    5
  );
});
