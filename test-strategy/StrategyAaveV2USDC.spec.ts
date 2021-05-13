import * as dotenv from 'dotenv';

import { DESCRIPTION } from './common';
import { testStrategyAaveLendingPoolV2 } from './StrategyAaveLendingPoolV2.spec';

dotenv.config();

describe('StrategyAaveV2USDC', function () {
  it(DESCRIPTION, async function () {
    await testStrategyAaveLendingPoolV2(
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
