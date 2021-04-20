#!/bin/sh

# Script to run solt and generate standard-json files for Etherscan verification.

solFiles=(
  Registry
  TransitionDisputer
  TransitionEvaluator
  RollupChain
  # strategies
  strategies/interfaces/IStrategy
  strategies/StrategyDummy
)

run_solt_write() {
  for f in ${solFiles[@]}; do
    solt write contracts/$f.sol --npm --runs 800
  done
}
