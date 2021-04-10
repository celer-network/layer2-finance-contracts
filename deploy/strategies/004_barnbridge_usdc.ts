import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const strategyContractName = "StrategyBarnBridgeJcUSDC";
const strategyDeploymentName = "StrategyBarnBridgeUSDC";

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy(strategyContractName, {
    from: deployer,
    log: true,
    args: [
      process.env.SMART_YIELD,
      process.env.COMP_PROVIDER_POOL,
      process.env.YIELD_FARM,
      process.env.USDC,
      process.env.JCUSDC,
      process.env.BOND,
      process.env.UNISWAP_ROUTER,
      process.env.CONTROLLER
    ]
  });
};
  
deployFunc.tags = [strategyDeploymentName];
export default deployFunc;