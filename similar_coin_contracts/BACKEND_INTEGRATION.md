# SWCoin Backend Integration Guide

This document explains how to integrate the enhanced SWCoin contract with a backend service that rewards users for their data contributions.

## Contract Overview

The SWCoin contract now includes data-for-rewards functionality that allows:

1. Rewarding users for contributing data
2. Setting and adjusting reward rates
3. Anti-spam protections (daily limits and cooldowns)
4. Emergency pause/unpause

## Reward Functions

### Reward User for Generic Data

```javascript
function rewardUser(address user, string memory dataType) external onlyOwner whenNotPaused
```

Rewards a user based on a specific data type. The reward amount is determined by the `rewardRates` mapping.

**Parameters:**
- `user`: The wallet address of the user to reward
- `dataType`: String identifier for the type of data (must have a corresponding entry in `rewardRates`)

### Reward User for Pages Visited

```javascript
function rewardUserForPages(address user, uint256 pagesVisited) external onlyOwner whenNotPaused
```

Specifically rewards a user based on the number of pages they've visited. Uses the "perpage" reward rate.

**Parameters:**
- `user`: The wallet address of the user to reward
- `pagesVisited`: Number of pages the user visited

## Configuration Functions

### Set Reward Rate

```javascript
function setRewardRate(string memory dataType, uint256 rate) external onlyOwner
```

Sets the reward amount for a specific data type.

**Parameters:**
- `dataType`: String identifier for the data type
- `rate`: Amount in token wei (10^-18 of a token)

### Set Daily Submission Limit

```javascript
function setMaxDailySubmissions(uint256 newLimit) external onlyOwner
```

Sets the maximum number of submissions a user can make per day.

**Parameters:**
- `newLimit`: New submission limit (must be > 0)

### Configure Cooldown

```javascript
function setCooldownSettings(uint256 newPeriod, bool enabled) external onlyOwner
```

Configures the cooldown period between submissions.

**Parameters:**
- `newPeriod`: Time in seconds between allowed submissions
- `enabled`: Whether cooldown is active

## Helper Functions

### Get Remaining Submissions

```javascript
function getRemainingDailySubmissions(address user) external view returns (uint256)
```

Returns how many more submissions a user can make today.

### Get Cooldown Time Left

```javascript
function getCooldownTimeLeft(address user) external view returns (uint256)
```

Returns how many seconds until a user can submit again.

## Backend Integration Example

Here's an example of how to integrate with a Node.js backend:

```javascript
const { ethers } = require('ethers');
require('dotenv').config();

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Initialize contract
const contractAddress = "YOUR_DEPLOYED_CONTRACT_ADDRESS";
const abi = [
  "function rewardUser(address user, string memory dataType) external",
  "function rewardUserForPages(address user, uint256 pagesVisited) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function rewardRates(string memory dataType) external view returns (uint256)",
  "function getRemainingDailySubmissions(address user) external view returns (uint256)",
  "function getCooldownTimeLeft(address user) external view returns (uint256)"
];

const swCoin = new ethers.Contract(contractAddress, abi, wallet);

// Example API endpoint to reward users
async function handleDataSubmission(req, res) {
  try {
    const { walletAddress, pagesVisited } = req.body;
    
    // Validate inputs
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }
    
    if (!pagesVisited || pagesVisited <= 0) {
      return res.status(400).json({ error: 'Invalid pages visited' });
    }
    
    // Check if user has submissions left
    const remainingSubmissions = await swCoin.getRemainingDailySubmissions(walletAddress);
    if (remainingSubmissions <= 0) {
      return res.status(429).json({ error: 'Daily submission limit reached' });
    }
    
    // Check cooldown if applicable
    const cooldownLeft = await swCoin.getCooldownTimeLeft(walletAddress);
    if (cooldownLeft > 0) {
      return res.status(429).json({ 
        error: 'Cooldown period active',
        timeLeft: cooldownLeft
      });
    }
    
    // Process the reward
    const tx = await swCoin.rewardUserForPages(walletAddress, pagesVisited);
    const receipt = await tx.wait();
    
    // Calculate tokens rewarded (0.1 per page)
    const tokensRewarded = (pagesVisited * 0.1).toString();
    
    res.json({
      success: true,
      transactionHash: receipt.hash,
      tokensRewarded,
      pagesVisited
    });
    
  } catch (error) {
    // Handle errors
    if (error.message.includes('Cooldown period not met')) {
      return res.status(429).json({ error: 'Cooldown period active' });
    }
    
    res.status(500).json({ 
      error: 'Failed to process reward',
      details: error.message 
    });
  }
}
```

## Next Steps

1. Deploy the updated SWCoin contract
2. Save the contract address and ABI
3. Create a backend service using the example above
4. Develop a frontend that allows users to:
   - Connect their wallet
   - Submit browsing data
   - View their token balance
   - Access data insights and marketplace features

## Security Considerations

- Only the contract owner can mint new tokens
- Consider implementing additional roles (e.g., for different backend services)
- Add rate limiting on your backend to prevent abuse
- Store sensitive keys securely (never in code repositories)
- Consider implementing a proxy pattern for future upgrades