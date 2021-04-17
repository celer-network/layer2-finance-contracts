import { ethers, getNamedAccounts, network } from 'hardhat';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

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
