# SWCoin Distributor Guide

This guide explains how to deploy and use the SWCoinDistributor contract with your existing SWCoin token.

## Overview

The SWCoinDistributor is a separate contract that:
- Works with your already deployed SWCoin token
- Handles distributing rewards to users for data contributions
- Manages anti-spam measures and cooldown periods
- Requires tokens to be transferred to it before rewarding users

## Deployment Steps

1. **Note your SWCoin contract address**
   - This is the address you received when you deployed your SWCoin contract

2. **Update the deploy script**
   - Edit `scripts/deploy-distributor.js`
   - Replace `YOUR_DEPLOYED_SWCOIN_ADDRESS` with your actual SWCoin contract address

3. **Deploy the distributor**
   ```
   npx hardhat compile
   npx hardhat run scripts/deploy-distributor.js --network sepolia
   ```

4. **Fund the distributor**
   - Transfer SWCoin tokens to the distributor contract address
   - These tokens will be used as rewards for users

## How It Works

The SWCoinDistributor contract:
1. References your existing SWCoin token
2. Has functions to reward users for data submissions
3. Uses transferred tokens (not newly minted ones) for rewards

## Key Functions

### Reward Functions

- `rewardUser(address user, string memory dataType)`: Rewards a user for submitting data
- `rewardUserForPages(address user, uint256 pagesVisited)`: Rewards a user based on pages visited

### Administration Functions

- `setRewardRate(string memory dataType, uint256 rate)`: Configure reward rates
- `setMaxDailySubmissions(uint256 newLimit)`: Set maximum daily submissions
- `setCooldownSettings(uint256 newPeriod, bool enabled)`: Configure cooldown periods
- `pause()` and `unpause()`: Emergency controls

### Utility Functions

- `getRemainingDailySubmissions(address user)`: Check remaining submissions
- `getCooldownTimeLeft(address user)`: Check cooldown time
- `getContractBalance()`: Check current token balance
- `withdrawTokens(uint256 amount, address recipient)`: Emergency token withdrawal

## Backend Integration

To integrate with a backend service:

1. Initialize the contracts:
```javascript
// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Load contract info
const contractInfo = require('./distributor-info.json');

// Initialize SWCoin contract
const swCoinAbi = ["function balanceOf(address) view returns (uint256)"];
const swCoin = new ethers.Contract(contractInfo.swCoinAddress, swCoinAbi, wallet);

// Initialize distributor contract
const distributor = new ethers.Contract(
  contractInfo.distributorAddress, 
  contractInfo.distributorAbi, 
  wallet
);
```

2. Reward users:
```javascript
async function rewardUser(walletAddress, pagesVisited) {
  // Check distributor's token balance
  const balance = await distributor.getContractBalance();
  if (balance.eq(0)) {
    throw new Error("Distributor has no tokens to distribute");
  }
  
  // Reward the user
  const tx = await distributor.rewardUserForPages(walletAddress, pagesVisited);
  const receipt = await tx.wait();
  
  return {
    success: true,
    transactionHash: receipt.hash,
    pagesVisited: pagesVisited
  };
}
```

## Differences from Direct Implementation

Using a separate distributor contract has these differences:

1. **Two-step deployment**: Deploy SWCoin first, then deploy the distributor
2. **Manual funding**: You must transfer tokens to the distributor contract
3. **Fixed token supply**: No new tokens are minted as rewards
4. **Cleaner separation**: Token contract remains simple and focused

## Security Considerations

- Only the contract owner can distribute rewards
- The distributor needs to be funded with tokens
- Consider adding more granular roles (e.g., for multiple backends)
- Monitor the distributor's token balance regularly