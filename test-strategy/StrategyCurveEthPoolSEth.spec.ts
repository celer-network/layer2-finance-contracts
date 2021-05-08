import * as dotenv from 'dotenv';
import { DESCRIPTION } from './common';
import { testStrategyCurveEthPool } from './StrategyCurveEthPool.spec';

dotenv.config();

describe('StrategyCurveEthPoolSEth', function () {
  it(DESCRIPTION, async function () {
    await testStrategyCurveEthPool(this, undefined, 0, process.env.WETH_FUNDER as string);
  });
});
