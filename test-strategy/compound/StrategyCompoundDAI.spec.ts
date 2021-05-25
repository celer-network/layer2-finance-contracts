import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyCompoundErc20LendingPool } from './StrategyCompoundErc20LendingPool.spec';

dotenv.config();

describe('StrategyCompoundDAI', function () {
  it(DESCRIPTION, async function () {
    await testStrategyCompoundErc20LendingPool(
      this,
      process.env.STRATEGY_COMPOUND_DAI,
      'DAI',
      18,
      (process.env.COMPOUND_DAI || process.env.DAI) as string,
      process.env.COMPOUND_CDAI as string,
      process.env.DAI_FUNDER as string
    );
  });
});
