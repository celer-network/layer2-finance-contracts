import * as dotenv from 'dotenv';

import { DESCRIPTION } from './common';
import { testStrategyCurve3Pool } from './StrategyCurve3Pool.spec';

dotenv.config();

describe('StrategyCurve3PoolUSDC', function () {
  it(DESCRIPTION, async function () {
    await testStrategyCurve3Pool(
      this,
      process.env.STRATEGY_CURVE_3POOL_USDC,
      'USDC',
      6,
      1,
      process.env.USDC as string,
      process.env.USDC_FUNDER as string
    );
  });
});
