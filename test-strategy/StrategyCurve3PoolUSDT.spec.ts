import * as dotenv from 'dotenv';

import { DESCRIPTION } from './common';
import { testStrategyCurve3Pool } from './StrategyCurve3Pool.spec';

dotenv.config();

describe('StrategyCurve3PoolUSDT', function () {
  it(DESCRIPTION, async function () {
    await testStrategyCurve3Pool(
      this,
      process.env.STRATEGY_CURVE_USDT,
      'USDT',
      6,
      2,
      process.env.USDT as string,
      process.env.USDT_FUNDER as string
    );
  });
});
