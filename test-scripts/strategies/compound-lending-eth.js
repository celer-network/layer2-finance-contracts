const expect = require("chai").expect;
const ethers = require("ethers");
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const { 
    ALCHEMY_API_URL,　privateKey, controllerAddress, 
    fromController, aggregateCommit, aggregateUncommit
} = require("./utils.js");
const web3 = createAlchemyWeb3(ALCHEMY_API_URL);
web3.eth.accounts.wallet.add('0x' + privateKey);

const _strategyContract = require("../../artifacts/contracts/strategies/compound/StrategyCompoundEthLendingPool.sol/StrategyCompoundEthLendingPool.json");
const strategyAddress = "0xEC47eC9152Eb27Ece9725E28aB3Ec337e8c43044";
const strategyContract = new web3.eth.Contract(_strategyContract.abi, strategyAddress);

const wethAddress = "0xd0A1E359811322d97991E03f863a0C30C2cF029C";
const wethAbi = [{"constant":true,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"guy","type":"address"},{"name":"wad","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"src","type":"address"},{"name":"dst","type":"address"},{"name":"wad","type":"uint256"}],"name":"transferFrom","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"wad","type":"uint256"}],"name":"withdraw","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"dst","type":"address"},{"name":"wad","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"deposit","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"},{"name":"","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"payable":true,"stateMutability":"payable","type":"fallback"},{"anonymous":false,"inputs":[{"indexed":true,"name":"src","type":"address"},{"indexed":true,"name":"guy","type":"address"},{"indexed":false,"name":"wad","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"src","type":"address"},{"indexed":true,"name":"dst","type":"address"},{"indexed":false,"name":"wad","type":"uint256"}],"name":"Transfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"dst","type":"address"},{"indexed":false,"name":"wad","type":"uint256"}],"name":"Deposit","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"src","type":"address"},{"indexed":false,"name":"wad","type":"uint256"}],"name":"Withdrawal","type":"event"}]
const wethContract = new web3.eth.Contract(wethAbi, wethAddress);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("This contract test on kovan testnet https://kovan.etherscan.io/address/0xEC47eC9152Eb27Ece9725E28aB3Ec337e8c43044");

    let assetAddress = await strategyContract.methods.getAssetAddress().call();
    await expect(assetAddress).to.equal(wethAddress);
    console.log("weth address is:", assetAddress);

    let contractBalance = await strategyContract.methods.getBalance().call();
    console.log('eth balance of strategy contract:', contractBalance);
    let controllerBalance = await wethContract.methods.balanceOf(controllerAddress).call();
    console.log('weth balance of controller:', controllerBalance);

    // Approve 1 WETH for controller
    var approveAmount = 1 * Math.pow(10, 18);
    await wethContract.methods.approve(
        strategyAddress,
        web3.utils.toHex(approveAmount)
    ).send(fromController);
    await sleep(3000);

    let allowance = await wethContract.methods.allowance(controllerAddress, strategyAddress).call();
    await sleep(1000);
    await expect(ethers.BigNumber.from(allowance).eq(ethers.utils.parseEther('1'))).to.be.true;
    console.log("allowance of strategy contract:", allowance/1e18);


    console.log("===== Deposit 0.1 WETH =====");
    let nonce = await web3.eth.getTransactionCount(controllerAddress, 'latest');
    var commitAmount = 0.1 * Math.pow(10, 18);
    await aggregateCommit(strategyAddress, strategyContract, nonce, web3.utils.toHex(commitAmount));
    await sleep(12000);
    
    let afterDepositContractBalance = await strategyContract.methods.getBalance().call();
    await expect(ethers.BigNumber.from(afterDepositContractBalance).sub(ethers.BigNumber.from(contractBalance))
            .gt(ethers.utils.parseEther('0.1'))).to.be.true;
    console.log('eth balance of strategy contract:', afterDepositContractBalance);

    let afterDepositControllerBalance = await wethContract.methods.balanceOf(controllerAddress).call();
    await expect(ethers.BigNumber.from(controllerBalance).sub(ethers.BigNumber.from(afterDepositControllerBalance))
            .eq(ethers.utils.parseEther('0.1'))).to.be.true;
    console.log('weth balance of controller:', afterDepositControllerBalance);
    
 
    console.log("===== Withdraw 0.08 WETH =====");
    nonce = await web3.eth.getTransactionCount(controllerAddress, 'latest');
    var uncommitAmount = 0.08 * Math.pow(10, 18);
    await aggregateUncommit(strategyAddress, strategyContract, nonce, web3.utils.toHex(uncommitAmount));
    await sleep(12000);
   
    let afterWithdrawContractBalance = await strategyContract.methods.getBalance().call();
    await expect(ethers.BigNumber.from(afterWithdrawContractBalance).add(ethers.utils.parseEther('0.08'))
            .gt(ethers.BigNumber.from(afterDepositContractBalance))).to.be.true;
    console.log('eth balance of strategy contract:', afterWithdrawContractBalance);

    let afterWithdrawControllerBalance = await wethContract.methods.balanceOf(controllerAddress).call();
    await expect(ethers.BigNumber.from(afterWithdrawControllerBalance).sub(ethers.BigNumber.from(afterDepositControllerBalance))
            .eq(ethers.utils.parseEther('0.08'))).to.be.true;
    console.log("weth balance of controller:", afterWithdrawControllerBalance);
}

main().catch((err) => {
    console.error(err);
});