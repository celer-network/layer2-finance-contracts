import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyAaveLendingPool } from './StrategyAaveLendingPool.spec';

dotenv.config();

describe('StrategyAaveDAI', function () {
  it(DESCRIPTION, async function () {
    await testStrategyAaveLendingPool(
      this,
      process.env.STRATEGY_AAVE_DAI,
      'DAI',
      18,
      (process.env.AAVE_DAI || process.env.DAI) as string,
      process.env.AAVE_ADAI as string,
      process.env.DAI_FUNDER as string
    );
  });
});
