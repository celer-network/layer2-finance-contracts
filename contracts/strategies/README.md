## Overview

Strategies are customized adapters that talk to DeFi protocols. They act on behalf of the L2 users on Layer2.finance to
move funds in and out of the protocols. If the underlying protocol offers yield farming of governance tokens, the
strategies can also harvest them and compound these additional yields.

A strategy authorizes a controller account, which is just the [`RollupChain`](../RollupChain.sol) contract in the current implementation, to move
funds.

Currently, each strategy accepts a single type of `ERC-20` asset like `DAI`.

## Developing a strategy

1. Fork the repo and run `yarn install` to install the dependencies. We primarily use `ethers`, `hardhat` and
   `waffle` for development and testing.

2. Take a look the [`IStrategy`](https://github.com/celer-network/layer2-finance-contracts/blob/0f8cec2a6a082d2476a7e3cde61f00c8e35f24d/contracts/strategies/interfaces/IStrategy.sol) interfaces:

   `getAssetAddress` simply returns the address of the asset token.

   `aggregateCommit` is a controller-only method that moves the specified amount of assets from the controller into the
   underlying DeFi protocol.

   `aggregateUncommit` is a controller-only method that moves the specified amount of assets from the DeFi protocol back to
   the controller.

   `syncBalance` returns the balance of the asset tokens managed by the strategy. It may synchronize the balance with the
   protocol before returning it.

   `harvest` is implemented when the protocol provides additional yields in the form of governance tokens. The method
   usually sells the harvested tokens into the asset token and re-invests the gains back into the protocol. Beware of
   flashloans when implementing this method and if required, restrict it to Externally Owned Accounts (EOA).

3. Read [`StrategyDummy`](https://github.com/celer-network/layer2-finance-contracts/blob/0f8cec2a6a082d2476a7e3cde61f00c8e35f24d/contracts/strategies/StrategyDummy.sol) for a skeleton implementation and [`StrategyCompoundErc20LendingPool`](https://github.com/celer-network/layer2-finance-contracts/blob/0f8cec2a6a082d2476a7e3cde61f00c8e35f24d/contracts/strategies/compound/StrategyCompoundErc20LendingPool.sol) for a real
   implementation.

4. Implement your own strategy.

5. To test your strategy, read the test [instructions](https://github.com/celer-network/layer2-finance-contracts/blob/0f8cec2a6a082d2476a7e3cde61f00c8e35f24de/test-strategy/README.md).

6. (Optional) Write a deployment script. Ours are based on `hardhat-deploy`. See [example](https://github.com/celer-network/layer2-finance-contracts/blob/0f8cec2a6a082d2476a7e3cde61f00c8e35f24d/deploy/strategies/000_compound_dai.ts).

7. Open a PR to the repo. We will review your strategy and hopefully add it to Layer2.finance.
