import * as dotenv from 'dotenv';

import { DESCRIPTION } from './common';
import { testStrategyAaveLendingPool } from './StrategyAaveLendingPool.spec';

dotenv.config();

describe('StrategyAaveUSDC', function () {
  it(DESCRIPTION, async function () {
    await testStrategyAaveLendingPool(
      this,
      process.env.STRATEGY_AAVE_USDC,
      'USDC',
      6,
      process.env.USDC as string,
      process.env.AAVE_AUSDC as string,
      process.env.USDC_FUNDER as string
    );
  });
});
