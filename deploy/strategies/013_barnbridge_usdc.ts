import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const strategyContractName = "StrategyBarnBridgeJToken";
const strategyDeploymentName = "StrategyBarnBridgeJcUSDC";

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy(strategyContractName, {
    from: deployer,
    log: true,
    args: [
      process.env.BARN_BRIDGE_USDC_SMART_YIELD,
      process.env.BARN_BRIDGE_USDC_COMP_PROVIDER_POOL,
      'USDC',
      process.env.BARN_BRIDGE_USDC_YIELD_FARM,
      process.env.USDC,
      process.env.BARN_BRIDGE_BOND,
      process.env.UNISWAP_ROUTER,
      process.env.ROLLUP_CHAIN
    ]
  });
};
  
deployFunc.tags = [strategyDeploymentName];
export default deployFunc;