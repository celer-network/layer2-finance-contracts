## Test strategies manually

1. Obtain the test ETH and tokens.

2. Fill out the required environment variables in `.env`.

3. Run the test command with the desired network:

```sh
hardhat test <path-to-test> --network <network>
```

## Mainnet forking

1. Make sure `IMPERSONATED_ACCOUNT` is filled out in the env.

2. Run:

```sh
hardhat node --fork <mainnet-eth-rpc> --fork-block-number <recent-mainchain-block-number>
```

3. Run the test command with the `localhost` network.
