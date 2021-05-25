import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyAaveLendingPool } from './StrategyAaveLendingPool.spec';

dotenv.config();

describe('StrategyAaveBUSD', function () {
  it(DESCRIPTION, async function () {
    await testStrategyAaveLendingPool(
      this,
      process.env.STRATEGY_AAVE_BUSD,
      'BUSD',
      18,
      process.env.BUSD as string,
      process.env.AAVE_ABUSD as string,
      process.env.BUSD_FUNDER as string
    );
  });
});
