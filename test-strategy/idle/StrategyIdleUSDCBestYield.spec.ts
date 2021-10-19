import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyIdleLendingPool } from './StrategyIdleLendingPool.spec';

dotenv.config();

describe('StrategyIdleUSDCBestYield', function () {
    it(DESCRIPTION, async function () {
        await testStrategyIdleLendingPool(
            this,
            process.env.STRATEGY_IDLE_USDC_BEST_YIELD,
            'USDC',
            process.env.USDC as string,
            6,
            process.env.IDLE_USDC_BEST_YIELD as string,
            process.env.USDC_FUNDER as string
        );
    });
});