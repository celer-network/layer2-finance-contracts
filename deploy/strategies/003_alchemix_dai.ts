import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const strategyContractName = 'StrategyAlchemixDAI';
const strategyDeploymentName = 'DeployStrategyAlchemixDAI';

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy(strategyContractName, {
    from: deployer,
    log: true,
    args: [
      process.env.ALCHEMIST,
      process.env.TRANSMUTER,
      process.env.ALUSD,
      process.env.DAI,
      process.env.ROLLUP_CHAIN
    ]
  });
};

deployFunc.tags = [strategyDeploymentName];
export default deployFunc;