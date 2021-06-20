import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyIdleLendingPool } from './StrategyIdleLendingPool.spec';

dotenv.config();

describe('StrategyIdleWETHBestYield', function () {
    it(DESCRIPTION, async function () {
        await testStrategyIdleLendingPool(
            this,
            process.env.STRATEGY_IDLE_WETH_BEST_YIELD,
            'WETH',
            process.env.WETH as string,
            18,
            process.env.IDLE_WETH_BEST_YIELD as string,
            process.env.WETH_FUNDER as string
        );
    });
});