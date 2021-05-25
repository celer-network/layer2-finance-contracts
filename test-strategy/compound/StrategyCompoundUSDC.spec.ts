import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyCompoundErc20LendingPool } from './StrategyCompoundErc20LendingPool.spec';

dotenv.config();

describe('StrategyCompoundUSDC', function () {
  it(DESCRIPTION, async function () {
    await testStrategyCompoundErc20LendingPool(
      this,
      process.env.STRATEGY_COMPOUND_USDC,
      'USDC',
      6,
      process.env.USDC as string,
      process.env.COMPOUND_CUSDC as string,
      process.env.USDC_FUNDER as string
    );
  });
});
