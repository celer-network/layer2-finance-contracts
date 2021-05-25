import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyCompoundErc20LendingPool } from './StrategyCompoundErc20LendingPool.spec';

dotenv.config();

describe('StrategyCompoundUSDT', function () {
  it(DESCRIPTION, async function () {
    await testStrategyCompoundErc20LendingPool(
      this,
      process.env.STRATEGY_COMPOUND_USDT,
      'USDT',
      6,
      process.env.USDT as string,
      process.env.COMPOUND_CUSDT as string,
      process.env.USDT_FUNDER as string
    );
  });
});
