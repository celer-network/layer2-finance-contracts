import { ethers, getNamedAccounts, network } from 'hardhat';

import { BigNumber } from '@ethersproject/bignumber';
import { MaxUint256 } from '@ethersproject/constants';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { ERC20 } from '../typechain/ERC20.d';

export const DESCRIPTION = 'should commit, uncommit and optionally harvest';

export async function getDeployerSigner(): Promise<SignerWithAddress> {
  const impersonatedDeployer = process.env.IMPERSONATED_DEPLOYER;
  let deployer: string;
  if (impersonatedDeployer) {
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [impersonatedDeployer]
    });
    deployer = impersonatedDeployer;
  } else {
    deployer = (await getNamedAccounts())['deployer'];
  }
  return await ethers.getSigner(deployer);
}

export async function ensureBalanceAndApproval(
  token: ERC20,
  symbol: string,
  minAmount: BigNumber,
  deployerSigner: SignerWithAddress,
  strategyAddress: string,
  tokenFunderAddress: string
): Promise<void> {
  if ((await token.balanceOf(deployerSigner.address)).lt(minAmount)) {
    console.log(`===== Obtain ${symbol} =====`);
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [tokenFunderAddress]
    });
    await (
      await token.connect(await ethers.getSigner(tokenFunderAddress)).transfer(deployerSigner.address, minAmount)
    ).wait();
  }
  if ((await token.allowance(deployerSigner.address, strategyAddress)).lt(minAmount)) {
    console.log(`===== Approve ${symbol} =====`);
    await (await token.connect(deployerSigner).approve(strategyAddress, MaxUint256)).wait();
  }
}
