require('@nomicfoundation/hardhat-toolbox');
require('@nomicfoundation/hardhat-verify');
require('hardhat-gas-reporter');
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    // Polygon Amoy Testnet for now. Will switch to mainnet later.
    amoy: {
      url: process.env.RPC_URL,
      chainId: 80002,
      accounts: process.env.ISSUER_PRIVATE_KEY
        ? [process.env.ISSUER_PRIVATE_KEY]
        : [],
      gasPrice: 'auto',
    },
    polygon: {
      url: process.env.RPC_URL,
      chainId: 137,
      accounts: process.env.ISSUER_PRIVATE_KEY
        ? [process.env.ISSUER_PRIVATE_KEY]
        : [],
      gasPrice: 'auto',
    },
  },
  etherscan: {
    apiKey: {
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || '',
      polygon: process.env.POLYGONSCAN_API_KEY || '',
    },
    customChains: [
      {
        network: 'polygonAmoy',
        chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 80002,
        urls: {
          apiURL: 'https://api-amoy.polygonscan.com/api',
          browserURL: 'https://amoy.polygonscan.com',
        },
      },
    ],
  },
  gasReporter: {
    enabled: 'true',
    currency: 'USD',
    outputFile: 'gas-report.txt',
    noColors: true,
  },
  paths: {
    sources: './contracts',
    scripts: './scripts',
  },
};
