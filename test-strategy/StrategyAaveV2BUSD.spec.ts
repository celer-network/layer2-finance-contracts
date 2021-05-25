import * as dotenv from 'dotenv';

import { DESCRIPTION } from './common';
import { testStrategyAaveLendingPoolV2 } from './StrategyAaveLendingPoolV2.spec';

dotenv.config();

describe('StrategyAaveV2BUSD', function () {
  it(DESCRIPTION, async function () {
    await testStrategyAaveLendingPoolV2(
      this,
      process.env.STRATEGY_AAVE_V2_BUSD,
      'BUSD',
      18,
      process.env.BUSD as string,
      process.env.AAVE_ABUSD as string,
      process.env.BUSD_FUNDER as string
    );
  });
});
