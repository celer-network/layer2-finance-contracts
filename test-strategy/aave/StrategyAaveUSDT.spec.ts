import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyAaveLendingPool } from './StrategyAaveLendingPool.spec';

dotenv.config();

describe('StrategyAaveUSDT', function () {
  it(DESCRIPTION, async function () {
    await testStrategyAaveLendingPool(
      this,
      process.env.STRATEGY_AAVE_USDT,
      'USDT',
      6,
      process.env.USDT as string,
      process.env.AAVE_AUSDT as string,
      process.env.USDT_FUNDER as string
    );
  });
});
