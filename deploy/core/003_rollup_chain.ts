import * as dotenv from 'dotenv';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

dotenv.config();

const deployFunc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const transitionDisputer = await deployments.get('TransitionDisputer');
  const registry = await deployments.get('Registry');

  await deploy('RollupChain', {
    from: deployer,
    log: true,
    args: [
      process.env.ROLLUP_BLOCK_CHALLENGE_PERIOD,
      process.env.ROLLUP_MAX_PRIORITY_TX_DELAY,
      transitionDisputer.address,
      registry.address,
      process.env.ROLLUP_OPERATOR
    ]
  });
};

deployFunc.tags = ['RollupChain'];
deployFunc.dependencies = ['Registry', 'TransitionDisputer'];
export default deployFunc;
