const expect = require("chai").expect;
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const { 
    AlchemyApiUrl,　privateKey, controllerAddress, 
    fromController, etherBigNumber, parseEther,
    aggregateCommit, aggregateUncommit
} = require("./utils.js");
const web3 = createAlchemyWeb3(AlchemyApiUrl);
web3.eth.accounts.wallet.add('0x' + privateKey);

const _strategyContract = require("../../artifacts/contracts/strategies/StrategyAaveLendingPool.sol/StrategyAaveLendingPool.json");
const strategyAddress = "0x5c950A53d16c39340C60be6E44536Bee8800A194";
const strategyContract = new web3.eth.Contract(_strategyContract.abi, strategyAddress);

const daiAddress = "0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD";
const erc20Abi = require('erc-20-abi');
const daiContract = new web3.eth.Contract(erc20Abi, daiAddress);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("This contract test on kovan testnet https://kovan.etherscan.io/address/0x5c950A53d16c39340C60be6E44536Bee8800A194");

    let assetAddress = await strategyContract.methods.getAssetAddress().call();
    await expect(assetAddress).to.equal(daiAddress);
    console.log("dai address is:", assetAddress);

    let contractBalance = await strategyContract.methods.getBalance().call();
    console.log('dai balance of strategy contract:', contractBalance/1e18);
    let controllerBalance = await daiContract.methods.balanceOf(controllerAddress).call();
    console.log('dai balance of controller:', controllerBalance/1e18);
   
    // Appove 400 DAI for controller
    var approveAmount = 400;
    await daiContract.methods.approve(
        strategyAddress,
        web3.utils.toBN(web3.utils.toWei(approveAmount.toString(), 'ether'))
    ).send(fromController);
    await sleep(3000);
   
    let allowance = await daiContract.methods.allowance(controllerAddress,　strategyAddress).call();
    await sleep(1000);
    await expect(etherBigNumber(allowance).eq(parseEther('400'))).to.be.true;
    console.log("allowance of contract:", allowance/1e18);


    console.log("===== Deposit 400 DAI =====");
    let nonce = await web3.eth.getTransactionCount(controllerAddress, 'latest');
    var commitAmount = 400;
    await aggregateCommit(strategyAddress, strategyContract, nonce, web3.utils.toBN(web3.utils.toWei(commitAmount.toString(), 'ether')));
    await sleep(12000);

    let afterDepositContractBalance = await strategyContract.methods.getBalance().call();
    await expect(etherBigNumber(afterDepositContractBalance).sub(etherBigNumber(contractBalance))
            .gt(parseEther('400'))).to.be.true;
    console.log('dai balance of strategy contract:', afterDepositContractBalance/1e18);

    let afterDepositControllerBalance = await daiContract.methods.balanceOf(controllerAddress).call();
    await expect(etherBigNumber(controllerBalance).sub(etherBigNumber(afterDepositControllerBalance))
            .eq(parseEther('400'))).to.be.true;
    console.log('dai balance of controller:', afterDepositControllerBalance/1e18);

    
    console.log("===== Withdraw 300 DAI =====");
    nonce = await web3.eth.getTransactionCount(controllerAddress, 'latest');
    var uncommitAmount = 300;
    await aggregateUncommit(strategyAddress, strategyContract, nonce, web3.utils.toBN(web3.utils.toWei(uncommitAmount.toString(), 'ether')));
    await sleep(12000);

    let afterWithdrawContractBalance = await strategyContract.methods.getBalance().call();
    await expect(etherBigNumber(afterWithdrawContractBalance).add(parseEther('300'))
            .gt(etherBigNumber(afterDepositContractBalance)))
    console.log('dai balance of strategy contract:', afterWithdrawContractBalance/1e18);

    let afteWithdrawControllerBalance = await daiContract.methods.balanceOf(controllerAddress).call();
    await expect(etherBigNumber(afteWithdrawControllerBalance).sub(etherBigNumber(afterDepositControllerBalance))
            .eq(parseEther('300'))).to.be.true;
    console.log('dai balance of cotroller:', afteWithdrawControllerBalance/1e18);
}

main().catch((err) => {
    console.error(err);
});