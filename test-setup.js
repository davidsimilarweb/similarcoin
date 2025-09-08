const { exec } = require('child_process');
const fs = require('fs');

console.log('🚀 DataTrade Extension Setup Test\n');

// Check if required files exist
const requiredFiles = [
  'manifest.json',
  'popup.html',
  'popup.js', 
  'background.js',
  'content.js',
  'contracts/DataTradeToken.sol',
  'backend/server.js',
  'package.json'
];

console.log('✅ Checking required files...');
let allFilesExist = true;

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`   ✓ ${file}`);
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.log('\n❌ Some required files are missing!');
  process.exit(1);
}

console.log('\n✅ All required files present!');

// Check if node_modules exists
if (fs.existsSync('node_modules')) {
  console.log('✅ Dependencies installed');
} else {
  console.log('⚠️  Run "npm install" to install dependencies');
}

// Check if .env exists
if (fs.existsSync('.env')) {
  console.log('✅ Environment file exists');
} else {
  console.log('⚠️  Copy .env.example to .env and add your keys');
}

console.log('\n🎯 Next Steps:');
console.log('1. npm install');
console.log('2. Copy .env.example to .env and add your keys');
console.log('3. npx hardhat run scripts/deploy.js --network localhost');
console.log('4. npm run dev');
console.log('5. Load extension in Chrome (chrome://extensions/)');
console.log('6. Connect MetaMask and test!');

console.log('\n✨ Ready for demo!');