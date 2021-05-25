import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const strategyContractName = 'StrategyCurveEth';
const strategyDeploymentName = 'StrategyCurveStEthETH';

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy(strategyContractName, {
    from: deployer,
    log: true,
    args: [
      process.env.ROLLUP_CHAIN,
      0,
      process.env.CURVE_STETH,
      process.env.CURVE_STETH_LPTOKEN,
      process.env.CURVE_STETH_GAUGE,
      process.env.CURVE_MINTR,
      process.env.CURVE_CRV,
      process.env.WETH,
      process.env.UNISWAP_ROUTER
    ]
  });
};

deployFunc.tags = [strategyDeploymentName];
export default deployFunc;
