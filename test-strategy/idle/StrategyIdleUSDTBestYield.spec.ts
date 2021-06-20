import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyIdleLendingPool } from './StrategyIdleLendingPool.spec';

dotenv.config();

describe('StrategyIdleUSDTBestYield', function () {
    it(DESCRIPTION, async function () {
        await testStrategyIdleLendingPool(
            this,
            process.env.STRATEGY_IDLE_USDT_BEST_YIELD,
            'USDT',
            process.env.USDT as string,
            6,
            process.env.IDLE_USDT_BEST_YIELD as string,
            process.env.USDT_FUNDER as string
        );
    });
});