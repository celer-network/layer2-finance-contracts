import '@nomiclabs/hardhat-waffle';
import 'hardhat-contract-sizer';
import 'hardhat-gas-reporter';
import '@typechain/hardhat';

import { HardhatUserConfig } from 'hardhat/types';

const kovanAlchemyApiUrl = process.env.KOVAN_ALCHEMY_API_URL || "https://eth-kovan.alchemyapi.io/v2/ffffffffff";
const kovanPrivateKey = process.env.KOVAN_PRIVATE_KEY || "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {},
    kovan: {
      url: kovanAlchemyApiUrl,
      accounts: [`0x${kovanPrivateKey}`],
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
