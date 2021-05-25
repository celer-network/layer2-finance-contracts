import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyAaveLendingPoolV2 } from './StrategyAaveLendingPoolV2.spec';

dotenv.config();

describe('StrategyAaveV2DAI', function () {
  it(DESCRIPTION, async function () {
    await testStrategyAaveLendingPoolV2(
      this,
      process.env.STRATEGY_AAVE_V2_DAI,
      'DAI',
      18,
      process.env.DAI as string,
      process.env.AAVE_ADAI as string,
      process.env.DAI_FUNDER as string
    );
  });
});
