import * as dotenv from 'dotenv';

import { DESCRIPTION } from './common';
import { testStrategyAaveLendingPoolV2 } from './StrategyAaveLendingPoolV2.spec';

dotenv.config();

describe('StrategyAaveV2USDT', function () {
  it(DESCRIPTION, async function () {
    await testStrategyAaveLendingPoolV2(
      this,
      process.env.STRATEGY_AAVE_V2_USDT,
      'USDT',
      6,
      process.env.USDT as string,
      process.env.AAVE_AUSDT as string,
      process.env.USDT_FUNDER as string
    );
  });
});
