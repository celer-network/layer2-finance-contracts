import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyIdleLendingPool } from './StrategyIdleLendingPool.spec';

dotenv.config();

describe('StrategyIdleUSDTRiskAdjusted', function () {
    it(DESCRIPTION, async function () {
        await testStrategyIdleLendingPool(
            this,
            process.env.STRATEGY_IDLE_USDT_RISK_ADJUSTED,
            'USDT',
            process.env.USDT as string,
            6,
            process.env.IDLE_USDT_RISK_ADJUSTED as string,
            process.env.USDT_FUNDER as string
        );
    });
});