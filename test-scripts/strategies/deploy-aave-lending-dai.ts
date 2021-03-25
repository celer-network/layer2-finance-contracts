import { ethers } from "hardhat";
import { StrategyAaveLendingPool } from '../../typechain/StrategyAaveLendingPool';

async function main() {
    const factory = await ethers.getContractFactory("StrategyAaveLendingPool");

    let contract = await factory.deploy(
        "0xE0fBa4Fc209b4948668006B2bE61711b7f465bAe", // address of Aave Lending Pool
        "DAI", 
        "0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD", // address of DAI
        "0xdCf0aF9e59C002FA3AA091a46196b37530FD48a8", // address of aDAI
        "0xa747eD5Ca0Aa67f8D9519d0a05149dC89c0d05FA", // address of controller
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