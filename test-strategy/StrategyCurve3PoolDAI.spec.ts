import * as dotenv from 'dotenv';

import { DESCRIPTION } from './common';
import { testStrategyCurve3Pool } from './StrategyCurve3Pool.spec';

dotenv.config();

describe('StrategyCurve3PoolDAI', function () {
  it(DESCRIPTION, async function () {
    await testStrategyCurve3Pool(
      this,
      process.env.STRATEGY_CURVE_3POOL_DAI,
      'DAI',
      18,
      0,
      process.env.DAI as string,
      process.env.DAI_FUNDER as string
    );
  });
});
