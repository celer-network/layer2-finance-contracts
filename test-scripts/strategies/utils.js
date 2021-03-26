const kovanJson = require('../../kovan.json');
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const AlchemyApiUrl = kovanJson.AlchemyApiUrl;
const web3 = createAlchemyWeb3(AlchemyApiUrl);
const controllerAddress = "0xa747eD5Ca0Aa67f8D9519d0a05149dC89c0d05FA";
const privateKey = kovanJson.privateKey;

const fromController = {
    from: controllerAddress,
    gasLimit: web3.utils.toHex(5000000),
    gasPrice: web3.utils.toHex(200000000000),
    value: web3.utils.toWei('0', 'wei')
};

const ethers = require("ethers");
const etherBigNumber = ethers.BigNumber.from;
const parseEther = ethers.utils.parseEther;

exports.AlchemyApiUrl = AlchemyApiUrl;
exports.privateKey = privateKey;
exports.controllerAddress = controllerAddress;
exports.fromController = fromController;
exports.etherBigNumber = etherBigNumber;
exports.parseEther = parseEther;

module.exports.aggregateCommit = async function (strategyAddress, strategyContract, nonce, commitAmount) {
    const tx = {
        'from': controllerAddress,
        'to': strategyAddress,
        'nonce': nonce,
        'gas': 500000,
        'data': strategyContract.methods.aggregateCommit(commitAmount).encodeABI()
    };

    const signPromise = web3.eth.accounts.signTransaction(tx, privateKey);
    signPromise.then((signedTx) => {
      web3.eth.sendSignedTransaction(signedTx.rawTransaction, function(err, hash) {
        if (!err) {
          console.log("The hash of your transaction is: ", hash, "\n Check Alchemy's Mempool to view the status of your transaction!"); 
        } else {
          console.log("Something went wrong when submitting your transaction:", err)
        }
      });
    }).catch((err) => {
      console.log("Promise failed:", err);
    });    
}

module.exports.aggregateUncommit = async function (strategyAddress, strategyContract, nonce, uncommitAmount) {
    const tx = {
        'from': controllerAddress,
        'to': strategyAddress,
        'nonce': nonce,
        'gas': 500000,
        'data': strategyContract.methods.aggregateUncommit(web3.utils.toBN(uncommitAmount)).encodeABI()
    };

    const signPromise = web3.eth.accounts.signTransaction(tx, privateKey);
    signPromise.then((signedTx) => {
      web3.eth.sendSignedTransaction(signedTx.rawTransaction, function(err, hash) {
        if (!err) {
          console.log("The hash of your transaction is: ", hash, "\n Check Alchemy's Mempool to view the status of your transaction!"); //
        } else {
          console.log("Something went wrong when submitting your transaction:", err)
        }
      });
    }).catch((err) => {
      console.log("Promise failed:", err);
    });    
}
