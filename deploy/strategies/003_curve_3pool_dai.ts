import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const strategyContractName = 'StrategyCurve3PoolDAI';
const strategyDeploymentName = 'StrategyCurve3PoolDAI';

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy(strategyContractName, {
    from: deployer,
    log: true,
    args: [
      process.env.ROLLUP_CHAIN,
      process.env.CURVE_DAI,
      process.env.CURVE_3POOL,
      process.env.CURVE_3POOL_3CRV,
      process.env.CURVE_3POOL_GAUGE,
      process.env.CURVE_3POOL_MINTR,
      process.env.CURVE_CRV,
      process.env.WETH,
      process.env.UNISWAP_ROUTER
    ]
  });
};

deployFunc.tags = [strategyDeploymentName];
export default deployFunc;
