# Layer 2 Finance Contracts

Contracts for the Layer 2 Finance DeFi aggregator, powered by optimistic rollup.

### Run unit tests

```sh
yarn test
```

### Benchmark gas cost

```sh
yarn report-gas:benchmark
yarn report-gas:summary
```

Check `reports/gas_usage`.

### Update contract sizes

```sh
yarn size-contracts
```

Check `reports/contract_sizes.txt`.

### Deployment

1. In the project root directory, update `.env`. Example values are in `.env.template`.
2. Run deployment commands:

```sh
hardhat deploy --network ropsten --tags TestToken
```

```sh
hardhat deploy --network ropsten --tags Faucet
```

3. Verify on Etherscan

Try:

```sh
hardhat etherscan-verify --network ropsten
```

4. (Alternative) Manually verify on Etherscan:

First, flatten the contract to verify:

```sh
hardhat flatten <path-to-contract> > flattened.out
```

Edit `flattened.out` to remove the duplicate `SPDX-License-Identifier` lines and submit to Etherscan.
