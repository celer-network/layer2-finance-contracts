import '@nomiclabs/hardhat-waffle';
import 'hardhat-contract-sizer';
import 'hardhat-gas-reporter';
import '@typechain/hardhat';

import { HardhatUserConfig } from 'hardhat/types';

import { resolve } from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: resolve(__dirname, "./.env.kovan")});

const alchemyApiUrl = process.env.ALCHEMY_API_URL;
const privateKey = process.env.PRIVATE_KEY;

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {},
    kovan: {
      url: alchemyApiUrl,
      accounts: [`0x${privateKey}`],
    }
  },
  solidity: {
    version: '0.7.6',
    settings: {
      optimizer: {
        enabled: process.env.DEBUG ? false : true,
        runs: 200
      }
    }
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
    disambiguatePaths: false
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    noColors: true,
    outputFile: 'reports/gas_usage/summary.txt'
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5'
  }
};

export default config;
