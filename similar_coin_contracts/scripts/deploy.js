const hre = require("hardhat");

async function main() {
  // Get the contract to deploy.
  const SWCoin = await hre.ethers.getContractFactory("SWCoin");

  // Define the constructor arguments for our token.
  const tokenName = "Similar Coin";
  const tokenSymbol = "SIM";
  
  // Deploy the contract with the name and symbol.
  const swCoin = await SWCoin.deploy(tokenName, tokenSymbol);

  // Wait for the contract to be deployed to the network.
  await swCoin.deployed();

  console.log(`SWCoin deployed to: ${swCoin.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
