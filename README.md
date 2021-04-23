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
hardhat deploy --network <network> --tags <deployment-tags>
```

3. To verify on Etherscan using Hardhat, try:

```sh
hardhat etherscan-verify --network <network>
```

4. To verify on Etherscan using [solt](https://github.com/hjubb/solt/blob/main/README.md), run:

```sh
source scripts/solt.sh
run_solt_write()
```

Then try:

```sh
solt verify --license 3 --network <network> solc-input-<contract>.json <deployed address> <contract name>
```

If the second step fails, go to Etherscan and manually verify using the standard JSON input files.

5. (Not recommended, does not work with ABIEncoderV2) To flatten and manually verify on Etherscan:

First, flatten the contract to verify:

```sh
hardhat flatten <path-to-contract> > flattened.out
```

Edit `flattened.out` to remove the duplicate `SPDX-License-Identifier` lines and submit to Etherscan.
