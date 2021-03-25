import { ethers } from "hardhat";
import { StrategyCompoundErc20LendingPool } from '../../typechain/StrategyCompoundErc20LendingPool';

async function main() {
    const factory = await ethers.getContractFactory("StrategyCompoundErc20LendingPool");

    let contract = await factory.deploy(
        "DAI",
        "0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa", // address of DAI
        "0xf0d0eb522cfa50b716b3b1604c4f0fa6f04376ad", // address of cDAI
        "0x5eAe89DC1C671724A672ff0630122ee834098657", // address of comptroller
        "0x61460874a7196d6a22D1eE4922473664b3E95270", // address of COMP
        "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // address of UniswapV2Router02
        "0xd0A1E359811322d97991E03f863a0C30C2cF029C", // address of WETH
        "0xa747eD5Ca0Aa67f8D9519d0a05149dC89c0d05FA" // address of controller
    );

    console.log(contract.address);
    console.log(contract.deployTransaction.hash);

    await contract.deployed();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });