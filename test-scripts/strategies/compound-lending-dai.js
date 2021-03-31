const expect = require("chai").expect;
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const { 
    AlchemyApiUrl,　privateKey, controllerAddress, 
    fromController, etherBigNumber, parseEther,
    aggregateCommit, aggregateUncommit
} = require("./utils.js");
const web3 = createAlchemyWeb3(AlchemyApiUrl);
web3.eth.accounts.wallet.add('0x' + privateKey);

const _strategyContract = require("../../artifacts/contracts/strategies/compound/StrategyCompoundErc20LendingPool.sol/StrategyCompoundErc20LendingPool.json");
const strategyAddress = "0xFedE213Ec5f11A1055364035A4C9D7bC61901D74";
const strategyContract = new web3.eth.Contract(_strategyContract.abi, strategyAddress);

const daiAddress = "0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa"
const erc20Abi = require('erc-20-abi');
const daiContract = new web3.eth.Contract(erc20Abi, daiAddress);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("This contract test on kovan testnet https://kovan.etherscan.io/address/0xFedE213Ec5f11A1055364035A4C9D7bC61901D74");

    let assetAddress = await strategyContract.methods.getAssetAddress().call();
    await expect(assetAddress).to.equal(daiAddress);
    console.log("dai address is:", assetAddress);

    let contractBalance = await strategyContract.methods.getBalance().call();
    console.log('dai balance of strategy contract:', contractBalance);
    let controllerBalance = await daiContract.methods.balanceOf(controllerAddress).call();
    console.log('dai balance of controller:', controllerBalance);

    // Appove 1 DAI for controller
    let approveAmount = 1 * Math.pow(10, 18);
    await daiContract.methods.approve(
        strategyAddress,
        web3.utils.toHex(approveAmount)
    ).send(fromController);
    await sleep(3000);
    
    let allowance = await daiContract.methods.allowance(controllerAddress, strategyAddress).call();
    await sleep(1000);
    await expect(etherBigNumber(allowance).eq(parseEther('1'))).to.be.true;
    console.log("allowance of strategy contract:", allowance/1e18);

    
    console.log("===== Deposit 0.001 DAI =====");
    let nonce = await web3.eth.getTransactionCount(controllerAddress, 'latest');
    var commitAmount = 0.001 * Math.pow(10, 18);
    await aggregateCommit(strategyAddress, strategyContract, nonce, web3.utils.toHex(commitAmount));
    await sleep(12000);

    let afterDepositContractBalance = await strategyContract.methods.getBalance().call();
    await expect(etherBigNumber(afterDepositContractBalance).sub(etherBigNumber(contractBalance))
            .gt(parseEther('0.001'))).to.be.true;
    console.log('dai balance of strategy contract:', afterDepositContractBalance);

    let afterDepositControllerBalance = await daiContract.methods.balanceOf(controllerAddress).call();
    await expect(etherBigNumber(controllerBalance).sub(etherBigNumber(afterDepositControllerBalance))
            .eq(parseEther('0.001'))).to.be.true;
    console.log('dai balance of controller:', afterDepositControllerBalance);
    

    console.log("===== Withdraw 0.0007 DAI =====");
    nonce = await web3.eth.getTransactionCount(controllerAddress, 'latest');
    var uncommitAmount = 0.0007 * Math.pow(10, 18);
    await aggregateUncommit(strategyAddress, strategyContract, nonce, web3.utils.toHex(uncommitAmount));
    await sleep(12000);
    
    let afterWithdrawContractBalance = await strategyContract.methods.getBalance().call();
    await expect(etherBigNumber(afterWithdrawContractBalance).add(parseEther('0.0007'))
            .gt(etherBigNumber(afterDepositContractBalance))).to.be.true;
    console.log('dai balance of strategy contract:', afterWithdrawContractBalance);

    let afterWithdrawControllerBalance = await daiContract.methods.balanceOf(controllerAddress).call();
    await expect(etherBigNumber(afterWithdrawControllerBalance).sub(etherBigNumber(afterDepositControllerBalance))
            .eq(parseEther('0.0007'))).to.be.true;
    console.log('dai balance of cotroller:', afterWithdrawControllerBalance);
}

main().catch((err) => {
    console.error(err);
});
