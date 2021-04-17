import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const strategyContractName = 'StrategyDummy';

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy(strategyContractName, {
    from: deployer,
    log: true,
    args: [process.env.ROLLUP_CHAIN, process.env.DUMMY_ASSET, process.env.DUMMY_FUNDER, process.env.DUMMY_HARVEST_GAIN]
  });
};

deployFunc.tags = [process.env.DUMMY_DEPLOYMENT_NAME || 'StrategyDummy'];
export default deployFunc;
