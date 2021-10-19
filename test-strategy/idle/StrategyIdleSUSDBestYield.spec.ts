import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyIdleLendingPool } from './StrategyIdleLendingPool.spec';

dotenv.config();

describe('StrategyIdleSUSDBestYield', function () {
    it(DESCRIPTION, async function () {
        await testStrategyIdleLendingPool(
            this,
            process.env.STRATEGY_IDLE_SUSD_BEST_YIELD,
            'SUSD',
            process.env.SUSD as string,
            18,
            process.env.IDLE_SUSD_BEST_YIELD as string,
            process.env.SUSD_FUNDER as string
        );
    });
});