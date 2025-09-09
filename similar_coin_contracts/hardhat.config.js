require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // Specify the Solidity compiler version to use.
  solidity: "0.8.20",
  // Define the networks where you can deploy your contracts.
  networks: {
    sepolia: {
      // Use environment variables for sensitive data.
      url: process.env.SEPOLIA_RPC_URL,
      // The `accounts` array contains the private key of the wallet
      // that will be used to sign transactions and pay for gas.
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};
