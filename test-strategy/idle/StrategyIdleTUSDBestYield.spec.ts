import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyIdleLendingPool } from './StrategyIdleLendingPool.spec';

dotenv.config();

describe('StrategyIdleTUSDBestYield', function () {
    it(DESCRIPTION, async function () {
        await testStrategyIdleLendingPool(
            this,
            process.env.STRATEGY_TUSD_BEST_YIELD,
            'TUSD',
            process.env.TUSD as string,
            18,
            process.env.IDLE_TUSD_BEST_YIELD as string,
            process.env.TUSD_FUNDER as string
        );
    });
});