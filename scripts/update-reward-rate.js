const { ethers } = require('ethers');
require('dotenv').config();

async function updateRewardRate() {
    try {
        console.log('Updating reward rate to 0.01 SIM per page...');
        
        // Connect to network
        let provider, wallet;
        if (process.env.SEPOLIA_RPC_URL && process.env.PRIVATE_KEY && 
            process.env.PRIVATE_KEY !== 'your_private_key_here') {
            provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
            wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
            console.log('Connected to Sepolia network');
        } else {
            provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
            wallet = await provider.getSigner(0);
            console.log('Connected to local network');
        }

        // Load contract info
        const contractInfo = require('../contract-info.json');
        
        // Create contract instance
        const distributorContract = new ethers.Contract(
            contractInfo.address, 
            [
                ...contractInfo.abi,
                "function setRewardRate(string memory dataType, uint256 rate) external"
            ], 
            wallet
        );

        console.log(`Contract address: ${contractInfo.address}`);
        console.log(`Wallet address: ${await wallet.getAddress()}`);

        // Check current rate
        const currentRate = await distributorContract.rewardRates("perpage");
        console.log(`Current rate: ${ethers.formatEther(currentRate)} SIM per page`);

        // New rate: 0.01 tokens = 1 * 10^16 wei (since 1 token = 10^18 wei)
        const newRate = ethers.parseUnits('0.01', 18);
        console.log(`Setting new rate: ${ethers.formatEther(newRate)} SIM per page`);

        // Update the rate
        const tx = await distributorContract.setRewardRate("perpage", newRate);
        console.log(`Transaction submitted: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

        // Verify the change
        const updatedRate = await distributorContract.rewardRates("perpage");
        console.log(`Updated rate: ${ethers.formatEther(updatedRate)} SIM per page`);
        
        console.log('✅ Reward rate successfully updated!');

    } catch (error) {
        console.error('❌ Error updating reward rate:', error);
        process.exit(1);
    }
}

updateRewardRate();