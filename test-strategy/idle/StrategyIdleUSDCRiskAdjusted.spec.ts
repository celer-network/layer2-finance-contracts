import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyIdleLendingPool } from './StrategyIdleLendingPool.spec';

dotenv.config();

describe('StrategyIdleUSDCRiskAdjusted', function () {
    it(DESCRIPTION, async function () {
        await testStrategyIdleLendingPool(
            this,
            process.env.STRATEGY_IDLE_USDC_RISK_ADJUSTED,
            'USDC',
            process.env.USDC as string,
            6,
            process.env.IDLE_USDC_RISK_ADJUSTED as string,
            process.env.USDC_FUNDER as string
        );
    });
});