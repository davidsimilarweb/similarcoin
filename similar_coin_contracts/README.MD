# MyToken: A Simple ERC20 Token Project

This project demonstrates how to create and deploy a simple ERC20 token on the Ethereum Sepolia testnet using Hardhat and OpenZeppelin Contracts.PrerequisitesBefore you begin, make sure you have the following installed:

- Node.js: https://nodejs.org/en/

- npm: Comes with Node.js.

- A text editor: Visual Studio Code is highly recommended.

- A crypto wallet: MetaMask is the most popular choice.

## Step 1: Set up your Project Directory

1. Create a new folder for your project and navigate into it from your terminal.
```bash
mkdir my-token-project
cd my-token-project
```
2. Initialize a new Node.js project.
```bash 
npm init -y 
```

## Step 2: Install Hardhat and Dependencies

Install Hardhat, the Ethers.js plugin, and the OpenZeppelin Contracts library.
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts
```

## Step 3: Create Hardhat Configuration
In your project root, create a file named `hardhat.config.js`. This file configures your project, including the networks you'll deploy to. The provided `hardhat.config.js` file uses environment variables to keep your sensitive information secure.

## Step 4: Secure Your Private Key and API Key

IMPORTANT: Never hardcode your private key or API key directly into your files. This is a major security risk.

1. Create a `.env` file in the root of your project.
```bash 
touch .env
```

2. Get your wallet's private key from MetaMask.

- Open MetaMask, click on the three dots next to your account, and select "Account details.
- "Click "Export Private Key," enter your password, and copy the key.

3. Get a Sepolia RPC URL from a service like Alchemy or Infura.

- Create a free account and generate a new key for the Sepolia network.

4. Add your keys to the `.env` file you created.
```
SEPOLIA_RPC_URL="YOUR_SEPOLIA_RPC_URL"
PRIVATE_KEY="YOUR_METAMASK_PRIVATE_KEY"
```

Add `.env` to your `.gitignore` file to prevent it from being committed to version control.

## Step 5: Write the Token Smart Contract
Create a `contracts` directory and place the `MyToken.sol` file inside it. This contract is a simple ERC20 token that uses the secure, battle-tested code from the OpenZeppelin library.

## Step 6: Write the Deployment Script

Create a `scripts` directory and place the `deploy.js` file inside it. This script will use `Hardhat` and `Ethers.js` to deploy your `MyToken.sol` contract to the Sepolia testnet.

## Step 7: Compile and Deploy

1. Compile your contract to generate the necessary artifacts.
```bash
npx hardhat compile
```

2. Get test ETH for gas fees. 
You'll need some test ETH on the Sepolia network to pay for the deployment transaction. You can get this from a Sepolia faucet.

3. Deploy your token to the Sepolia testnet.
```bash
npx hardhat run scripts/deploy.js --network sepolia
```
This command will deploy your contract, and your terminal will print the deployed token's address. 

Congratulations! Your token is now live on the Sepolia testnet.

## Step 8: Verify the Contract (Optional but Recommended)

Once deployed, you can verify your contract on a block explorer like Etherscan to ensure the code matches the deployed bytecode. This gives users confidence in your token.

-----
Here’s a step-by-step workflow for creating and deploying an ERC20 token to the Ethereum blockchain:

1. Set Up Your Development Environment

Install Node.js and npm.

Install Hardhat: `npm install --save-dev hardhat`

Initialize a Hardhat project: `npx hardhat init`

Install OpenZeppelin contracts: `npm install @openzeppelin/contracts`

2. Write Your Token Contract

Create a Solidity file (e.g., SWCoin.sol) in the contracts folder.

Use OpenZeppelin’s ERC20 implementation for security and best practices.

3. Configure Hardhat

Edit hardhat.config.js to set the Solidity version and network settings.

Add your Infura RPC URL and wallet private key to a .env file for secure access.

4. Write a Deployment Script

Create a script (e.g., deploy.js in scripts) that uses Hardhat to deploy your contract.

Pass the token name and symbol as constructor arguments.

5. Compile the Contract

Run: `npx hardhat compile`

Fix any compilation errors.

6. Deploy to a Testnet (e.g., Sepolia)

Run: `npx hardhat run [deploy.js](http://_vscodecontentref_/6) --network sepolia`

The script will output the deployed contract address.

7. Verify Deployment

Check the contract address on Etherscan (for Sepolia or mainnet).

Optionally, verify the contract source code on Etherscan.


Essential Steps:

- Write the token contract.
- Configure network and environment variables.
- Write and run the deployment script.
- Verify the contract on the blockchain.


-----
To get your Infura Project ID and private key, follow these steps:

Infura Project ID:

Go to https://infura.io and sign up or log in.

Create a new project in your Infura dashboard.

Open the project settings. You will see your "Project ID"—copy this value.


Private Key:

Open your Ethereum wallet (such as MetaMask).
Select the account you want to use.

Find the option to export or view your private key (usually under account settings or security).

Copy the private key and keep it secure—never share it publicly.