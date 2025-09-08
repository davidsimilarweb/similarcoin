# DataTrade Browser Extension

A proof-of-concept browser extension that rewards users with ERC20 tokens for sharing their navigation data, inspired by Brave's BAT model.

## 🚀 Quick Start

### Prerequisites
- Node.js and npm installed
- MetaMask browser extension
- Some Sepolia ETH for gas fees (get from faucet)

### Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your Infura API key and private key
```

3. **Deploy the smart contract:**
```bash
# For local development (start Hardhat node first)
npx hardhat node

# Then deploy to localhost
npx hardhat run scripts/deploy.js --network localhost

# Or deploy to Sepolia testnet
npx hardhat run scripts/deploy.js --network sepolia
```

4. **Start the backend server:**
```bash
npm run dev
```

5. **Load the browser extension:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select this directory

## 🎯 Demo Flow

1. **Connect Wallet**: Click "Connect Wallet" in the extension popup
2. **Browse the Web**: Visit different websites to collect navigation data
3. **Submit Data**: Click "Submit Data for Tokens" to earn 10 DTT tokens
4. **Check Balance**: View your token balance in the popup

## 🏗️ Architecture

### Smart Contract (`DataTradeToken.sol`)
- ERC20 token with symbol "DTT"
- Mints 10 tokens per data submission
- 1-hour cooldown between submissions
- Deployed on Sepolia testnet

### Browser Extension
- **Content Script**: Tracks page visits and time spent
- **Background Script**: Handles data storage and API communication
- **Popup**: User interface for wallet connection and data submission

### Backend API (`backend/server.js`)
- Receives navigation data from extension
- Validates data quality and calculates scores
- Mints tokens to user wallets via smart contract

## 📊 Data Collection

The extension tracks:
- Pages visited
- Time spent on each page
- Domain diversity
- Navigation patterns

Data scoring algorithm:
- 2 points per page visited (max 20)
- 1 point per minute tracked (max 30)  
- 3 points per unique domain

Minimum 10 points required for token reward.

## 🔐 Privacy & Security

- Data transmitted to localhost backend only
- Wallet connection via MetaMask
- Smart contract prevents spam with cooldown
- No sensitive data collection

## 🛠️ Development

### Project Structure
```
├── manifest.json          # Extension manifest
├── popup.html/js          # Extension popup UI
├── content.js             # Data collection script
├── background.js          # Extension background script
├── contracts/             # Solidity smart contracts
├── backend/               # Express API server
└── scripts/               # Deployment scripts
```

### Testing
1. Load extension in Chrome
2. Start backend server
3. Connect MetaMask wallet
4. Browse web and submit data
5. Check tokens in wallet

### Contract Addresses
- Sepolia: (deploy to get address)
- Localhost: (deploy to get address)

## 💡 Hackathon Notes

This is a 1.5-day proof-of-concept for demonstrating:
- Browser extension data collection
- ERC20 token rewards
- MetaMask integration  
- Smart contract interaction

For production, add:
- Data encryption
- Privacy controls
- Advanced analytics
- Security audits
- Mainnet deployment