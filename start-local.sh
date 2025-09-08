#!/bin/bash

echo "🚀 Starting DataTrade Extension Local Development"
echo "=============================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your keys before continuing"
    echo "   For local development, you can leave INFURA_API_KEY and PRIVATE_KEY empty"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "🔥 To start development:"
echo "1. Terminal 1: npx hardhat node"
echo "2. Terminal 2: npx hardhat run scripts/deploy.js --network localhost" 
echo "3. Terminal 3: npm run dev"
echo "4. Load extension in Chrome (chrome://extensions/)"
echo ""
echo "💡 For testnet deployment:"
echo "1. Add your INFURA_API_KEY and PRIVATE_KEY to .env"
echo "2. npx hardhat run scripts/deploy.js --network sepolia"
echo ""
echo "✅ Setup complete! Happy hacking! 🎉"