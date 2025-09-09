const hre = require("hardhat");
require("dotenv").config();

async function main() {
  // Get the deployed SWCoin address from .env file or use the hardcoded value
  const swCoinAddress = process.env.DEPLOYED_TOKEN_ADDRESS || "0x5141D1872473c5a52509DCFb3E1C7568783524FA";
  
  console.log("Deploying SWCoinDistributor with SWCoin address:", swCoinAddress);
  
  // Get the contract to deploy
  const SWCoinDistributor = await hre.ethers.getContractFactory("SWCoinDistributor");
  
  // Deploy the distributor with the SWCoin address
  const distributor = await SWCoinDistributor.deploy(swCoinAddress);
  
  // Wait for deployment to complete
  await distributor.waitForDeployment();
  
  const distributorAddress = await distributor.getAddress();
  console.log("SWCoinDistributor deployed to:", distributorAddress);
  console.log("\nNext steps:");
  console.log("1. Transfer SWCoin tokens to the distributor contract");
  console.log(`   (Send tokens to: ${distributorAddress})`);
  console.log("2. Use the distributor contract to reward users for data submissions");
  
  // Save the contract address and ABI to a file for the backend
  const fs = require('fs');
  const contractInfo = {
    swCoinAddress: swCoinAddress,
    distributorAddress: distributorAddress,
    distributorAbi: [
      "function rewardUser(address user, string memory dataType) external",
      "function rewardUserForPages(address user, uint256 pagesVisited) external",
      "function getRemainingDailySubmissions(address user) external view returns (uint256)",
      "function getCooldownTimeLeft(address user) external view returns (uint256)",
      "function getContractBalance() external view returns (uint256)"
    ]
  };
  
  fs.writeFileSync('distributor-info.json', JSON.stringify(contractInfo, null, 2));
  console.log("Contract info saved to distributor-info.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });