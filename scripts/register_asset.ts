import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';

import * as dotenv from 'dotenv';
import { ethers, getNamedAccounts } from 'hardhat';

import { parseUnits } from '@ethersproject/units';

import { Registry__factory } from '../typechain/factories/Registry__factory';
import { RollupChain__factory } from '../typechain/factories/RollupChain__factory';

dotenv.config();

export async function registerAsset(): Promise<void> {
  const deployer = (await getNamedAccounts())['deployer'];
  const deployerSigner = await ethers.getSigner(deployer);
  const rollupChain = RollupChain__factory.connect(process.env.ROLLUP_CHAIN as string, deployerSigner);
  const registry = Registry__factory.connect(process.env.REGISTRY as string, deployerSigner);
  const asset = process.env.REGISTER_ASSET_ADDRESS as string;
  const decimals = Number(process.env.REGISTER_ASSET_DECIMALS as string);
  const depositLimit = process.env.REGISTER_ASSET_NET_DEPOSIT_LIMIT as string;
  const parsedDepositLimit = parseUnits(depositLimit, decimals);
  await (await registry.registerAsset(asset)).wait();
  console.log('Registered asset', asset);
  await (await rollupChain.setNetDepositLimit(asset, parsedDepositLimit)).wait();
  console.log('Set deposit limit to', depositLimit);
}

registerAsset();
