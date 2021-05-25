import * as dotenv from 'dotenv';

import { DESCRIPTION } from './common';
import { testStrategyAaveLendingPoolV2 } from './StrategyAaveLendingPoolV2.spec';

dotenv.config();

describe('StrategyAaveV2SUSD', function () {
  it(DESCRIPTION, async function () {
    await testStrategyAaveLendingPoolV2(
      this,
      process.env.STRATEGY_AAVE_V2_SUSD,
      'SUSD',
      18,
      process.env.SUSD as string,
      process.env.AAVE_ASUSD as string,
      process.env.SUSD_FUNDER as string
    );
  });
});
