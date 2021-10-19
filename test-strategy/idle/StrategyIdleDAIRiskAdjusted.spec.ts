import * as dotenv from 'dotenv';

import { DESCRIPTION } from '../common';
import { testStrategyIdleLendingPool } from './StrategyIdleLendingPool.spec';

dotenv.config();

describe('StrategyIdleDAIRiskAdjusted', function () {
    it(DESCRIPTION, async function () {
        await testStrategyIdleLendingPool(
            this,
            process.env.STRATEGY_IDLE_DAI_RISK_ADJUSTED,
            'DAI',
            process.env.DAI as string,
            18,
            process.env.IDLE_DAI_RISK_ADJUSTED as string,
            process.env.DAI_FUNDER as string
        );
    });
});