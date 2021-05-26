import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const strategyContractName = 'StrategyAaveLendingPoolV2';
const strategyDeploymentName = 'StrategyAaveV2USDT';

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy(strategyContractName, {
    from: deployer,
    log: true,
    args: [
      process.env.AAVE_LENDING_POOL,
      'USDT',
      process.env.USDT,
      process.env.AAVE_AUSDT,
      process.env.ROLLUP_CHAIN,
      process.env.AAVE_INCENTIVES_CONTROLLER,
      process.env.AAVE_STAKED_AAVE,
      process.env.AAVE_AAVE,
      process.env.UNISWAP_ROUTER,
      process.env.WETH
    ]
  });
};

deployFunc.tags = [strategyDeploymentName];
export default deployFunc;
