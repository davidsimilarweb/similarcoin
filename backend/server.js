const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const S3DataService = require('./s3Service');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`, {
    body: req.method === 'POST' ? req.body : undefined,
    params: Object.keys(req.params).length > 0 ? req.params : undefined,
    query: Object.keys(req.query).length > 0 ? req.query : undefined
  });
  next();
});

let provider;
let wallet;
let tokenContract;
let contractInfo;
let s3Service;

try {
  // Try different possible locations for the contract info file
  try {
    contractInfo = require('../contract-info.json');
    console.log('Loaded contract info from ../contract-info.json');
  } catch (err1) {
    try {
      contractInfo = require('./contract-info.json');
      console.log('Loaded contract info from ./contract-info.json');
    } catch (err2) {
      try {
        contractInfo = require('../../contract-info.json');
        console.log('Loaded contract info from ../../contract-info.json');
      } catch (err3) {
        // Fallback to hardcoded contract info if file not found
        contractInfo = {
          address: "0x6aC95F646540f05cC2aC5969a1A573Daab8b7524",
          abi: [
            "function rewardUser(address user, string memory dataType) external",
            "function rewardUserForPages(address user, uint256 pagesVisited) external",
            "function rewardRates(string memory dataType) external view returns (uint256)",
            "function dailySubmissions(address user, uint256 day) external view returns (uint256)",
            "function maxDailySubmissions() external view returns (uint256)",
            "function lastSubmission(address user) external view returns (uint256)",
            "function cooldownPeriod() external view returns (uint256)",
            "function cooldownEnabled() external view returns (bool)",
            "function swCoin() external view returns (address)",
            "function owner() external view returns (address)",
            "function pause() external",
            "function unpause() external",
            "function paused() external view returns (bool)"
          ]
        };
        console.log('Using hardcoded contract info as fallback');
      }
    }
  }
} catch (error) {
  console.error('Error loading contract info:', error);
}

// Initialize S3 service
s3Service = new S3DataService();

async function initializeBlockchain() {
  try {
    console.log('Initializing blockchain connection...');
    console.log('Environment check:');
    console.log('- SEPOLIA_RPC_URL exists:', !!process.env.SEPOLIA_RPC_URL);
    console.log('- PRIVATE_KEY exists:', !!process.env.PRIVATE_KEY);
    console.log('- PRIVATE_KEY is not placeholder:', process.env.PRIVATE_KEY !== 'your_private_key_here');
    
    if (process.env.SEPOLIA_RPC_URL && process.env.PRIVATE_KEY && 
        process.env.PRIVATE_KEY !== 'your_private_key_here') {
      console.log('Using Sepolia network configuration');
      provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
      wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
      console.log('Provider and wallet created successfully');
    } else {
      console.log('Using local network configuration');
      provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
      wallet = await provider.getSigner(0);
    }
    
    if (contractInfo) {
      console.log('Creating contract instance with address:', contractInfo.address);
      tokenContract = new ethers.Contract(contractInfo.address, contractInfo.abi, wallet);
      
      // Test the connection by calling a simple view function
      try {
        await tokenContract.owner();
        console.log('✅ Blockchain connection initialized successfully');
        console.log('Contract address:', contractInfo.address);
      } catch (testError) {
        console.error('❌ Contract connection test failed:', testError.message);
        tokenContract = null; // Reset on failure
      }
    } else {
      console.log('❌ No contract info available - skipping contract initialization');
    }
  } catch (error) {
    console.error('❌ Failed to initialize blockchain connection:', error.message);
    console.error('Full error:', error);
  }
}

app.get('/api/contract-info', (req, res) => {
  if (!contractInfo) {
    return res.status(404).json({ error: 'Contract not deployed yet' });
  }
  res.json(contractInfo);
});

app.post('/api/submit-data', async (req, res) => {
  try {
    const { walletAddress, pagesVisited, timeTracked, navigationData, chatgptPrompts, timestamp } = req.body;
    
  
  if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }
    
    if (!tokenContract) {
      return res.status(500).json({ error: 'Token contract not initialized' });
    }
    
    
    // Store data in S3 (both raw and anonymized versions)
    let s3StorageResult = null;
    try {
      s3StorageResult = await s3Service.storeSubmission({
        walletAddress,
        pagesVisited,
        timeTracked,
        navigationData,
        chatgptPrompts,
        timestamp
      });
      
    } catch (s3Error) {
      // Don't fail the entire request if S3 fails
    }
    
    const dataScore = calculateDataScore(pagesVisited, timeTracked, navigationData);
    
    // Removed data score validation for testing
    // if (dataScore < 10) {
    //   return res.status(400).json({ 
    //     error: 'Insufficient data for reward',
    //     minRequirement: 'At least 5 pages visited or 10 minutes tracked'
    //   });
    // }
    
    try {
      
      // Use simple flat rate: 0.01 tokens per page visited
      const tx = await tokenContract.rewardUserForPages(walletAddress, pagesVisited);
      
      const receipt = await tx.wait();
      
      // Calculate tokens rewarded: 0.01 * pagesVisited
      const tokensRewarded = (pagesVisited * 0.01).toString();
      
      res.json({
        success: true,
        transactionHash: receipt.transactionHash,
        tokensRewarded,
        pagesVisited,
        ratePerPage: '0.01',
        dataScore,
        submissionId: s3StorageResult?.submissionId,
        dataStored: !!s3StorageResult
      });
      
    } catch (mintError) {
      
      // Extract the actual contract error message
      let errorMessage = 'Failed to mint tokens';
      
      if (mintError.reason) {
        // ethers.js provides the revert reason directly
        errorMessage = mintError.reason;
      } else if (mintError.revert && mintError.revert.args && mintError.revert.args[0]) {
        // Sometimes it's in the revert object
        errorMessage = mintError.revert.args[0];
      } else if (mintError.message.includes('execution reverted:')) {
        // Extract from the message
        const match = mintError.message.match(/execution reverted: "([^"]+)"/);
        if (match) {
          errorMessage = match[1];
        }
      } else if (mintError.message.includes('Cooldown period not met')) {
        errorMessage = 'Cooldown period active. Please wait before submitting again.';
      }
      
      // Return appropriate status code based on error
      if (errorMessage.includes('Daily submission limit exceeded')) {
        return res.status(429).json({ 
          error: errorMessage,
          type: 'daily_limit'
        });
      } else if (errorMessage.includes('Cooldown period') || errorMessage.includes('wait')) {
        return res.status(429).json({ 
          error: errorMessage,
          type: 'cooldown'
        });
      } else if (errorMessage.includes('Must have visited at least 1 page')) {
        return res.status(400).json({ 
          error: errorMessage,
          type: 'invalid_data'
        });
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: mintError.message 
      });
    }
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

app.get('/api/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }
    
    if (!tokenContract) {
      return res.status(500).json({ error: 'Token contract not initialized' });
    }
    
    const balance = await tokenContract.balanceOf(address);
    const decimals = await tokenContract.decimals();
    const formattedBalance = ethers.formatUnits(balance, decimals);
    
    res.json({
      address,
      balance: formattedBalance,
      symbol: 'SIM'
    });
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to check balance',
      details: error.message 
    });
  }
});

function calculateDataScore(pagesVisited, timeTracked, navigationData) {
  let score = 0;
  
  score += Math.min(pagesVisited * 2, 20); // Max 20 points for pages
  score += Math.min(timeTracked, 30); // Max 30 points for time
  
  if (navigationData && navigationData.length > 0) {
    const uniqueDomains = new Set(navigationData.map(item => item.domain)).size;
    score += uniqueDomains * 3; // 3 points per unique domain
  }
  
  return score;
}


// Analytics endpoint
app.get('/api/analytics', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const analytics = await s3Service.generateAnalytics(days);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to generate analytics',
      details: error.message 
    });
  }
});

// Data marketplace endpoint - list available datasets
app.get('/api/marketplace', async (req, res) => {
  try {
    const submissions = await s3Service.listSubmissions('anonymized-data/', 100);
    const marketplace = {
      totalDatasets: submissions.length,
      categories: ['shopping', 'social', 'news', 'entertainment', 'productivity', 'general'],
      pricing: {
        perDataset: '5 SIM',
        bulkDiscount: '20% off for 10+ datasets'
      },
      dataTypes: ['browsing patterns', 'time spent', 'domain categories', 'session analytics']
    };
    res.json(marketplace);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to load marketplace',
      details: error.message 
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    contractConnected: !!tokenContract,
    s3Enabled: s3Service.enabled,
    s3Bucket: s3Service.bucketName
  });
});

app.listen(PORT, async () => {
  console.log(`SimilarCoin backend server running on port ${PORT}`);
  await initializeBlockchain();
});