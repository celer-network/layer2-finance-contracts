import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyIdleLendingPool } from './StrategyIdleLendingPool.spec';

dotenv.config();

describe('StrategyIdleWBTCBestYield', function () {
    it(DESCRIPTION, async function () {
        await testStrategyIdleLendingPool(
            this,
            process.env.STRATEGY_IDLE_WBTC_BEST_YIELD,
            'WBTC',
            process.env.WBTC as string,
            8,
            process.env.IDLE_WBTC_BEST_YIELD as string,
            process.env.WBTC_FUNDER as string
        );
    });
});