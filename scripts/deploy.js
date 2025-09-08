const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const DataTradeToken = await ethers.getContractFactory("DataTradeToken");
  const token = await DataTradeToken.deploy();

  await token.waitForDeployment();

  console.log("DataTradeToken deployed to:", await token.getAddress());
  
  // Save the contract address to a file for the backend
  const fs = require('fs');
  const contractInfo = {
    address: await token.getAddress(),
    abi: [
      "function rewardUser(address user, string memory dataType) external",
      "function rewardUserForPages(address user, uint256 pagesVisited) external",
      "function getBalance(address user) external view returns (uint256)",
      "function balanceOf(address account) external view returns (uint256)",
      "function symbol() external view returns (string)",
      "function decimals() external view returns (uint8)",
      "function rewardRates(string memory dataType) external view returns (uint256)",
      "function getRemainingDailySubmissions(address user) external view returns (uint256)",
      "function getCooldownTimeLeft(address user) external view returns (uint256)",
      "function pause() external",
      "function unpause() external",
      "function paused() external view returns (bool)"
    ]
  };
  
  fs.writeFileSync('contract-info.json', JSON.stringify(contractInfo, null, 2));
  console.log("Contract info saved to contract-info.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});