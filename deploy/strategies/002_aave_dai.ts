import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const strategyContractName = 'StrategyAaveLendingPool';
const strategyDeploymentName = 'StrategyAaveDAI';

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy(strategyContractName, {
    from: deployer,
    log: true,
    args: [process.env.AAVE_LENDING_POOL, 'DAI', process.env.AAVE_DAI, process.env.AAVE_ADAI, process.env.ROLLUP_CHAIN]
  });
};

deployFunc.tags = [strategyDeploymentName];
export default deployFunc;
