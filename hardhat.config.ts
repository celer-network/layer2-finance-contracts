import '@nomiclabs/hardhat-waffle';
import 'hardhat-typechain';

import { HardhatUserConfig } from 'hardhat/types';

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  solidity: {
    version: '0.7.6',
    settings: {
      optimizer: {
        enabled: process.env.DEBUG ? false : true,
        runs: 200
      }
    }
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5'
  }
};

export default config;
