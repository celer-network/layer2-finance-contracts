import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';

import * as dotenv from 'dotenv';
import { ethers, getNamedAccounts } from 'hardhat';

import { Registry__factory } from '../typechain/factories/Registry__factory';

dotenv.config();

export async function registerStrategy(): Promise<void> {
  const deployer = (await getNamedAccounts())['deployer'];
  const deployerSigner = await ethers.getSigner(deployer);
  const registry = Registry__factory.connect(process.env.REGISTRY as string, deployerSigner);
  const strategy = process.env.REGISTER_STRATEGY_ADDRESS as string;
  await (await registry.registerStrategy(strategy)).wait();
  console.log('Registered strategy', strategy);
}

registerStrategy();
