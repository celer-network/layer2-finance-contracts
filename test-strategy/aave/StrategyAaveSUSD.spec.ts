import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyAaveLendingPool } from './StrategyAaveLendingPool.spec';

dotenv.config();

describe('StrategyAaveSUSD', function () {
  it(DESCRIPTION, async function () {
    await testStrategyAaveLendingPool(
      this,
      process.env.STRATEGY_AAVE_SUSD,
      'SUSD',
      18,
      process.env.SUSD as string,
      process.env.AAVE_ASUSD as string,
      process.env.SUSD_FUNDER as string
    );
  });
});
