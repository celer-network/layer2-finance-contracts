import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const strategyContractName = 'StrategyCompoundEthLendingPool';
const strategyDeploymentName = 'StrategyCompoundETH';

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy(strategyContractName, {
    from: deployer,
    log: true,
    args: [
      process.env.COMPOUND_CETH,
      process.env.COMPOUND_COMPTROLLER,
      process.env.COMPOUND_COMP,
      process.env.UNISWAP_ROUTER,
      process.env.WETH,
      process.env.CONTROLLER
    ]
  });
};

deployFunc.tags = [strategyDeploymentName];
export default deployFunc;
