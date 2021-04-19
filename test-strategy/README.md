## Testing strategies manually

This folder contains basic tests for the strategies. Follow the steps to run them:

1. Obtain some test ETH and tokens on your target testnet.

2. Fill out the required environment variables in the `.env` file under the project root directory. The variable names
   are usually prefixed with `STRATEGY_NAME_`. You can find examples in the `spec.ts` test files.

3. Run the test command with the desired network:

```sh
hardhat test <path-to-test> --network <network>
```

4. Examine the asset balances before and after each call to the strategy APIs and see if they are behaving as expected.

## Mainnet forking

Oftentimes DeFi protocols don't have official testnet deployments. To avoid "testing in prod" which can get very
expensive, we use the amazing [mainnet forking](https://hardhat.org/guides/mainnet-forking.html) feature of `hardhat`
for sanity checks before deployment.

1. The example tests make use of an impersonated account for strategy deployment and interaction. Make sure the
   `IMPERSONATED_DEPLOYER` environment variable is filled out in the `.env` file. The impersonated account needs to have
   some mainnet ETH and the asset tokens for the strategy.

2. Start a local Ethereum network based on a snapshot of the mainnet:

```sh
hardhat node --no-deploy --fork <mainnet-eth-rpc> --fork-block-number <recent-mainchain-block-number>
```

Hardhat recommends specifying `--fork-block-number` to fork from a specific block. While this provides determinism and
much better test performance, it requires `mainnet-eth-rpc` to be backed by an archive node. We recommend Alchemy since
their free plan includes support for archive data. If you don't have access to an archive node, remove
`--fork-block-number`.

3. In a separate terminal, run the test command with the `localhost` network:

```sh
hardhat test <path-to-test> --network localhost
```
