let userAccount = null;
let web3Provider = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Force a fresh read from storage when popup opens
    console.log('[Popup] Opening popup, forcing fresh stats update...');
    await updateStats();
    
    // Try to load saved wallet state first
    await loadSavedWalletState();
    
    // Set up storage change listener to auto-update stats
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && (changes.pagesVisited || changes.navigationData || changes.tokenBalance)) {
            console.log('[Stats] Storage changed, updating stats:', changes);
            updateStats();
        }
    });
    
    // Listen for direct messages from content scripts about page counts and data collection
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'PAGE_COUNTED') {
            console.log(`[Stats] Page counted event: ${message.pagesVisited} pages, URL: ${message.url}`);
            updateStats(); // Immediately refresh display
        } else if (message.type === 'PROMPT_COLLECTED') {
            console.log(`[Stats] ChatGPT prompt collected: ${message.promptsCount} total prompts, length: ${message.promptLength}`);
            updateStats(); // Refresh to show any data-based rewards
        }
    });
    
    document.getElementById('connect-btn').addEventListener('click', connectWallet);
    document.getElementById('disconnect-btn').addEventListener('click', disconnectWallet);
    document.getElementById('submit-btn').addEventListener('click', submitData);
    document.getElementById('refresh-balance-btn').addEventListener('click', async () => {
        console.log('[Debug] Manual balance refresh triggered');
        console.log('[Debug] Current userAccount:', userAccount);
        console.log('[Debug] Current web3Provider:', !!web3Provider);
        
        // Debug: Log current storage state with detailed breakdown
        const storageData = await chrome.storage.local.get(['pagesVisited', 'timeTracked', 'navigationData', 'chatgptPrompts', 'tokenBalance']);
        console.log('[Debug] Current storage state:', {
            pagesVisited: storageData.pagesVisited,
            timeTracked: storageData.timeTracked, 
            navigationDataLength: (storageData.navigationData || []).length,
            chatgptPromptsLength: (storageData.chatgptPrompts || []).length,
            tokenBalance: storageData.tokenBalance,
            calculatedClaimable: ((storageData.pagesVisited || 0) * 0.01).toFixed(2)
        });
        
        if (!userAccount || !web3Provider) {
            console.log('[Debug] Missing connection, attempting to reconnect...');
            await loadSavedWalletState();
        } else {
            await updateTokenBalance();
        }
    });
    
    // Setup tab navigation
    setupTabNavigation();
});

async function updateStats() {
    try {
        const data = await chrome.storage.local.get(['pagesVisited', 'timeTracked', 'tokenBalance', 'navigationData']);
        const pagesVisited = data.pagesVisited || 0;
        const timeTracked = data.timeTracked || 0;
        const balance = data.tokenBalance || 0;

        // Debug log to see what's in storage
        console.log('[Stats] Current data:', {
            pagesVisited,
            timeTracked,
            navigationDataLength: (data.navigationData || []).length,
            balance
        });

        // Claimable SIM: 0.01 SIM per page
        const claimable = (pagesVisited * 0.01).toFixed(2);

        // Update balance display (pages-visited and time-tracked elements don't exist in current UI)
        document.getElementById('balance').textContent = parseFloat(balance).toFixed(2);
        const claimableEl = document.getElementById('claimable');
        if (claimableEl) {
            claimableEl.textContent = claimable;
            console.log(`[Stats] Updated claimable display to: ${claimable} (pages: ${pagesVisited})`);
        } else {
            console.error('[Stats] Claimable element not found!');
        }
        
    } catch (error) {
        // Silently handle error
    }
}


async function checkWalletConnection() {
    console.log('[Connection] Checking wallet connection...');
    const ethereum = await getEthereum();
    console.log('[Connection] Ethereum object:', !!ethereum);
    
    if (ethereum) {
        try {
            const accounts = await ethereum.request({ method: 'eth_accounts' });
            console.log('[Connection] Found accounts:', accounts);
            
            if (accounts && accounts.length > 0) {
                userAccount = accounts[0];
                web3Provider = new ethers.BrowserProvider(ethereum);
                console.log('[Connection] Connected to:', userAccount);
                console.log('[Connection] Web3Provider created:', !!web3Provider);
                
                updateUI(true);
                await updateTokenBalance();
            } else {
                console.log('[Connection] No accounts found');
            }
        } catch (error) {
            console.error('[Connection] Error:', error);
        }
    } else {
        console.log('[Connection] No ethereum object available');
    }
}

async function getEthereum() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return null;

        // Check if we can access this tab (chrome:// URLs are restricted)
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('moz-extension://')) {
            throw new Error('RESTRICTED_URL');
        }

        // Wait for page to be ready and then check for MetaMask
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second for page to load
        
        // First, do a simple direct check
        const simpleCheck = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN', // Execute in main world, same as webpage
            func: () => {
                return new Promise((resolve) => {
                    // Wait for DOM and MetaMask to be ready
                    const checkMetaMask = () => {
                        const result = {
                            hasEthereum: typeof window.ethereum !== 'undefined',
                            ethereumObj: window.ethereum ? {
                                isMetaMask: window.ethereum.isMetaMask,
                                chainId: window.ethereum.chainId,
                                selectedAddress: window.ethereum.selectedAddress
                            } : null,
                            readyState: document.readyState,
                            url: window.location.href
                        };
                        console.log('MetaMask check result:', result);
                        resolve(result);
                    };
                    
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', checkMetaMask);
                    } else {
                        // Page already loaded, check immediately
                        checkMetaMask();
                    }
                });
            }
        });
        
        
        // Use chrome.scripting to directly check for MetaMask
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN', // Execute in main world, same as webpage
            func: () => {
                // EIP-6963 detection with retry mechanism
                return new Promise((resolve) => {
                    const providers = [];
                    let attempts = 0;
                    const maxAttempts = 3;
                    
                    function tryDetection() {
                        attempts++;
                        
                        function onAnnouncement(event) {
                            providers.push({
                                info: event.detail.info,
                                uuid: event.detail.info.uuid
                            });
                        }
                        
                        window.addEventListener('eip6963:announceProvider', onAnnouncement);
                        window.dispatchEvent(new Event('eip6963:requestProvider'));
                        
                        setTimeout(() => {
                            window.removeEventListener('eip6963:announceProvider', onAnnouncement);
                            
                            // Check for legacy window.ethereum
                            
                            if (providers.length === 0 && typeof window.ethereum !== 'undefined') {
                                providers.push({
                                    info: { name: 'MetaMask', rdns: 'io.metamask' },
                                    uuid: 'legacy'
                                });
                            }
                            
                            // If no providers found and we have attempts left, try again
                            if (providers.length === 0 && attempts < maxAttempts) {
                                setTimeout(tryDetection, 500);
                            } else {
                                resolve(providers);
                            }
                        }, 500); // Increased wait time
                    }
                    
                    tryDetection();
                });
            }
        });

        const providers = await results[0].result;
        
        if (providers && providers.length > 0) {
            const metaMaskProvider = providers.find(p => 
                p.info.rdns === 'io.metamask' || p.info.name.includes('MetaMask')
            );
            
            if (metaMaskProvider) {
                return createEthereumProxy(tab.id, metaMaskProvider.uuid);
            }
        }
        
        return null;
    } catch (error) {
        if (error.message === 'RESTRICTED_URL') {
            console.log('Cannot access MetaMask from this page. Please navigate to a website first.');
        } else {
            // Silently handle error
        }
        return null;
    }
}

function createEthereumProxy(tabId, providerUuid) {
    return {
        request: async (params) => {
            const results = await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN', // Execute in main world
                func: (requestParams, uuid) => {
                    return new Promise((resolve, reject) => {
                        let provider;
                        
                        if (uuid === 'legacy' && typeof window.ethereum !== 'undefined') {
                            provider = window.ethereum;
                        } else {
                            // Try to get the specific provider
                            const providers = [];
                            
                            function onAnnouncement(event) {
                                if (event.detail.info.uuid === uuid) {
                                    provider = event.detail.provider;
                                }
                                providers.push(event.detail);
                            }
                            
                            window.addEventListener('eip6963:announceProvider', onAnnouncement);
                            window.dispatchEvent(new Event('eip6963:requestProvider'));
                            
                            setTimeout(() => {
                                window.removeEventListener('eip6963:announceProvider', onAnnouncement);
                                
                                if (!provider && typeof window.ethereum !== 'undefined') {
                                    provider = window.ethereum;
                                }
                                
                                if (provider) {
                                    provider.request(requestParams)
                                        .then(resolve)
                                        .catch(reject);
                                } else {
                                    reject(new Error('MetaMask provider not found'));
                                }
                            }, 100);
                            
                            return;
                        }
                        
                        if (provider) {
                            provider.request(requestParams)
                                .then(resolve)
                                .catch(reject);
                        } else {
                            reject(new Error('MetaMask provider not available'));
                        }
                    });
                },
                args: [params, providerUuid]
            });
            
            return results?.[0]?.result;
        },
        on: () => {} // Placeholder for event handling
    };
}

async function loadSavedWalletState() {
    // Show connecting state right away
    updateUI('connecting');
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_WALLET_STATE' }, async (response) => {
            if (response?.success && response.walletState?.connected && response.walletState?.account) {
                console.log('[Wallet] Found saved state:', response.walletState);
                
                // Try to reconnect using the saved account
                const ethereum = await getEthereum();
                if (ethereum) {
                    try {
                        const accounts = await ethereum.request({ method: 'eth_accounts' });
                        if (accounts && accounts.length > 0 && 
                            accounts[0].toLowerCase() === response.walletState.account.toLowerCase()) {
                            
                            userAccount = accounts[0];
                            web3Provider = new ethers.BrowserProvider(ethereum);
                            
                            console.log('[Wallet] Reconnected to saved account:', userAccount);
                            
                            updateUI(true);
                            await updateTokenBalance();
                            resolve(true);
                            return;
                        }
                    } catch (error) {
                        console.error('[Wallet] Error checking saved state:', error);
                    }
                }
            }
            
            // If no saved state or reconnection failed, try fresh connection
            await checkWalletConnection();
            resolve(false);
        });
    });
}

async function saveWalletState(connected, account) {
    const walletState = {
        connected: connected,
        account: account,
        lastConnected: Date.now()
    };
    
    console.log('[Wallet] Saving state:', walletState);
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
            type: 'SAVE_WALLET_STATE', 
            walletState: walletState 
        }, (response) => {
            resolve(response?.success === true);
        });
    });
}

async function connectWallet() {
    console.log('[Connect] Starting wallet connection...');
    
    // Show connecting state
    updateUI('connecting');
    
    const ethereum = await getEthereum();
    
    if (!ethereum) {
        console.log('[Connect] No ethereum object found');
        // Update UI back to disconnected state
        updateUI(false);
        
        // Check if we're on a restricted page
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('moz-extension://'))) {
            alert('Please navigate to a website (like google.com) to connect MetaMask. Extension pages cannot access MetaMask.');
        } else {
            alert('Please install MetaMask to use this extension!');
        }
        return;
    }

    try {
        console.log('[Connect] Requesting accounts...');
        const accounts = await ethereum.request({
            method: 'eth_requestAccounts'
        });
        
        console.log('[Connect] Received accounts:', accounts);
        
        userAccount = accounts[0];
        web3Provider = new ethers.BrowserProvider(ethereum);
        
        console.log('[Connect] Set userAccount:', userAccount);
        console.log('[Connect] Created web3Provider:', !!web3Provider);
        
        updateUI(true);
        // Update balance will handle network switching if needed
        await updateTokenBalance();
        
        // Save wallet state in background script for persistence
        await saveWalletState(true, userAccount);
        
    } catch (error) {
        console.error('[Connect] Connection error:', error);
        // Update UI back to disconnected state
        updateUI(false);
        alert('Failed to connect wallet. Please try again.');
    }
}

async function updateTokenBalance() {
    if (!userAccount || !web3Provider) {
        console.log('[Balance] Missing userAccount or web3Provider');
        return;
    }
    
    try {
        console.log('[Balance] Starting balance update for:', userAccount);
        
        // First, ensure user is on Sepolia testnet
        const network = await web3Provider.getNetwork();
        console.log('[Balance] Current network:', network.chainId, network.name);
        
        const sepoliaChainId = 11155111n; // Sepolia testnet chain ID
        
        if (network.chainId !== sepoliaChainId) {
            console.log('[Balance] Wrong network, requesting switch to Sepolia');
            // Request user to switch to Sepolia
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0xaa36a7' }], // Sepolia chain ID in hex
                });
                console.log('[Balance] Network switch requested');
            } catch (switchError) {
                console.log('[Balance] Switch error:', switchError);
                // If network doesn't exist, add it
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: '0xaa36a7',
                            chainName: 'Sepolia Testnet',
                            rpcUrls: ['https://sepolia.infura.io/v3/'],
                            nativeCurrency: {
                                name: 'ETH',
                                symbol: 'ETH',
                                decimals: 18
                            },
                            blockExplorerUrls: ['https://sepolia.etherscan.io/']
                        }]
                    });
                }
            }
            return; // Exit and let user switch network, function will be called again
        }
        
        console.log('[Balance] On correct network, fetching contract info');
        
        // Get contract info from backend, with fallback to local file
        let contractInfo;
        try {
            const response = await fetch('https://similarcoin.onrender.com/api/contract-info');
            if (response.ok) {
                contractInfo = await response.json();
            } else {
                throw new Error('Backend unavailable');
            }
        } catch (error) {
            console.log('[Balance] Backend unavailable, using local contract info');
            // Fallback to direct contract info
            contractInfo = {
                "address": "0x6aC95F646540f05cC2aC5969a1A573Daab8b7524",
                "abi": [
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
        }
        console.log('[Balance] Contract address:', contractInfo.address);
        
        // First, check if contract exists at this address
        const contractCode = await web3Provider.getCode(contractInfo.address);
        console.log('[Balance] Contract code length:', contractCode.length);
        
        if (contractCode === '0x') {
            console.error('[Balance] No contract found at address:', contractInfo.address);
            document.getElementById('balance').textContent = 'Contract not found';
            return;
        }
        
        // Create contract instance and get balance directly from MetaMask
        const contract = new ethers.Contract(
            contractInfo.address,
            contractInfo.abi,
            web3Provider
        );
        
        console.log('[Balance] Distributor contract exists, getting token contract address');
        
        // Get the token contract address from the distributor
        const tokenAddress = await contract.swCoin();
        console.log('[Balance] Token contract address:', tokenAddress);
        
        // Create token contract instance for balance queries
        const tokenContract = new ethers.Contract(
            tokenAddress,
            [
                "function balanceOf(address account) external view returns (uint256)",
                "function decimals() external view returns (uint8)",
                "function symbol() external view returns (string)"
            ],
            web3Provider
        );
        
        console.log('[Balance] Calling balanceOf for:', userAccount);
        const balance = await tokenContract.balanceOf(userAccount);
        console.log('[Balance] Raw balance:', balance.toString());
        
        const decimals = await tokenContract.decimals();
        console.log('[Balance] Token decimals:', decimals);
        
        const formattedBalance = ethers.formatUnits(balance, decimals);
        console.log('[Balance] Formatted balance:', formattedBalance);
        
        const balanceValue = parseFloat(formattedBalance).toFixed(2);
        console.log('[Balance] Final display value:', balanceValue);
        
        document.getElementById('balance').textContent = balanceValue;
        
        // Store in local storage as backup
        chrome.storage.local.set({ tokenBalance: balanceValue });
        
    } catch (error) {
        console.error('[Balance] Error getting balance:', error);
        // Fallback to stored balance if MetaMask call fails
        const data = await chrome.storage.local.get(['tokenBalance']);
        if (data.tokenBalance) {
            document.getElementById('balance').textContent = parseFloat(data.tokenBalance).toFixed(2);
        }
    }
}

async function submitData() {
    if (!userAccount) {
        alert('Please connect your wallet first!');
        return;
    }

    try {
        const data = await chrome.storage.local.get(['navigationData', 'pagesVisited', 'timeTracked', 'chatgptPrompts']);
        
        const submissionData = {
            walletAddress: userAccount,
            pagesVisited: data.pagesVisited || 0,
            timeTracked: data.timeTracked || 0,
            navigationData: data.navigationData || [],
            chatgptPrompts: data.chatgptPrompts || [],
            timestamp: Date.now()
        };

        document.getElementById('submit-btn').disabled = true;
        document.getElementById('submit-btn').textContent = 'Claiming...';
        document.getElementById('status').innerHTML = '<span style="color: #FFA500;">Processing claim...</span>';

        chrome.runtime.sendMessage({
            type: 'SUBMIT_DATA',
            data: submissionData
        }, async (response) => {
            if (response && response.success) {
                document.getElementById('status').innerHTML = '<span style="color: #16a34a;">Claim successful! Balance will update in ~30 seconds.</span>';
                try { startConfetti(); } catch (e) {}
                
                await new Promise((resolve) => {
                    chrome.storage.local.set({
                        pagesVisited: 0,
                        timeTracked: 0,
                        navigationData: [],
                        chatgptPrompts: []
                    }, resolve);
                });
                
                await updateStats();
                await updateTokenBalance();
                
                setTimeout(() => {
                    document.getElementById('status').innerHTML = '<span class="connected">Wallet connected</span>';
                }, 3000);
            } else {
                document.getElementById('status').innerHTML = '<span style="color: #ef4444;">Claim failed. Try again.</span>';
            }
            
            document.getElementById('submit-btn').disabled = false;
            document.getElementById('submit-btn').textContent = 'Claim SIM';
        });
        
    } catch (error) {
        console.error('[Submit] Error:', error);
        
        // Display the specific error message
        let errorMessage = 'Error claiming';
        if (error.message) {
            errorMessage = error.message;
        }
        
        document.getElementById('status').innerHTML = `<span style="color: #ef4444;">${errorMessage}</span>`;
        document.getElementById('submit-btn').disabled = false;
        document.getElementById('submit-btn').textContent = 'Claim SIM';
    }
}

function updateUI(connectionState) {
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const submitBtn = document.getElementById('submit-btn');
    const status = document.getElementById('status');
    const walletShort = document.getElementById('wallet-short');
    
    // Connection state can be: true (connected), false (disconnected), or 'connecting'
    if (connectionState === true) {
        // Connected
        const short = `${userAccount.slice(0, 6)}...${userAccount.slice(-4)}`;
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'block';
        disconnectBtn.disabled = false;
        
        if (walletShort) {
            walletShort.textContent = short;
            walletShort.style.cursor = 'pointer';
            walletShort.title = 'Click to copy full address';
            walletShort.onclick = () => copyToClipboard(userAccount);
        }
        submitBtn.disabled = false;
        status.innerHTML = '<span class="connected">Wallet connected</span>';
    } else if (connectionState === 'connecting') {
        // Connecting - show loading state
        connectBtn.style.display = 'block';
        disconnectBtn.style.display = 'none';
        connectBtn.innerHTML = 'Connecting <span class="spinner"></span>';
        connectBtn.disabled = true;
        
        if (walletShort) {
            walletShort.textContent = 'Connecting...';
            walletShort.style.cursor = 'default';
            walletShort.title = '';
            walletShort.onclick = null;
        }
        submitBtn.disabled = true;
        status.innerHTML = '<span class="connecting">Connecting wallet...</span>';
    } else {
        // Disconnected
        connectBtn.style.display = 'block';
        disconnectBtn.style.display = 'none';
        connectBtn.textContent = 'Connect Wallet';
        connectBtn.disabled = false;
        
        if (walletShort) {
            walletShort.textContent = 'Not connected';
            walletShort.style.cursor = 'default';
            walletShort.title = '';
            walletShort.onclick = null;
        }
        submitBtn.disabled = true;
        status.innerHTML = '<span class="disconnected">Wallet not connected</span>';
    }
}

// Check current connection status
function checkConnectionStatus() {
    console.log('[Status] userAccount:', userAccount);
    console.log('[Status] web3Provider:', !!web3Provider);
    console.log('[Status] Current balance display:', document.getElementById('balance').textContent);
    return !!(userAccount && web3Provider);
}

// Copy to clipboard function
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        
        // Show brief feedback
        const walletShort = document.getElementById('wallet-short');
        const originalText = walletShort.textContent;
        walletShort.textContent = 'Copied!';
        walletShort.style.color = '#16a34a';
        
        setTimeout(() => {
            walletShort.textContent = originalText;
            walletShort.style.color = '';
        }, 1000);
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        const walletShort = document.getElementById('wallet-short');
        const originalText = walletShort.textContent;
        walletShort.textContent = 'Copied!';
        walletShort.style.color = '#16a34a';
        
        setTimeout(() => {
            walletShort.textContent = originalText;
            walletShort.style.color = '';
        }, 1000);
    }
}

// Tab navigation setup
function setupTabNavigation() {
    const tabs = document.querySelectorAll('.tab');
    const homeContent = document.getElementById('home-content');
    const exploreContent = document.getElementById('explore-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabType = tab.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show appropriate content
            if (tabType === 'home') {
                homeContent.classList.remove('hidden');
                exploreContent.classList.add('hidden');
            } else if (tabType === 'explore') {
                homeContent.classList.add('hidden');
                exploreContent.classList.remove('hidden');
            }
        });
    });
}

// Open integration in new tab
function openIntegration(url) {
    chrome.tabs.create({ url: url });
}

// Disconnect wallet function
async function disconnectWallet() {
    console.log('[Disconnect] Disconnecting wallet');
    
    // Reset the connection
    userAccount = null;
    web3Provider = null;
    
    // Update the UI
    updateUI(false);
    
    // Save the disconnected state
    await saveWalletState(false, null);
    
    console.log('[Disconnect] Wallet disconnected');
}

// Set up event listener for account changes
(async () => {
    const ethereum = await getEthereum();
    if (ethereum) {
        ethereum.on('accountsChanged', async (accounts) => {
            if (accounts.length === 0) {
                userAccount = null;
                web3Provider = null;
                updateUI(false);
                
                // Save disconnected state
                await saveWalletState(false, null);
            } else {
                userAccount = accounts[0];
                web3Provider = new ethers.BrowserProvider(ethereum);
                updateUI(true);
                await updateTokenBalance();
                
                // Save new connected state
                await saveWalletState(true, userAccount);
            }
        });
    }
})();

// Lightweight confetti animation rendered on a canvas overlay
function startConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const deviceRatio = window.devicePixelRatio || 1;
    const logicalWidth = canvas.clientWidth || canvas.getBoundingClientRect().width;
    const logicalHeight = canvas.clientHeight || canvas.getBoundingClientRect().height;
    canvas.width = Math.max(1, Math.floor(logicalWidth * deviceRatio));
    canvas.height = Math.max(1, Math.floor(logicalHeight * deviceRatio));
    ctx.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);

    const W = logicalWidth;
    const H = logicalHeight;
    const colors = ['#1d4ed8', '#3b82f6', '#60a5fa', '#22c55e', '#fb923c', '#f97316'];
    const count = 120;
    const pieces = [];

    for (let i = 0; i < count; i++) {
        pieces.push({
            x: Math.random() * W,
            y: -20 - Math.random() * 60,
            w: 6 + Math.random() * 6,
            h: 8 + Math.random() * 10,
            rot: Math.random() * Math.PI,
            vx: -1 + Math.random() * 2,
            vy: 2 + Math.random() * 2,
            vr: -0.15 + Math.random() * 0.3,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }

    let active = true;
    const endTime = performance.now() + 1600;

    function frame(t) {
        ctx.clearRect(0, 0, W, H);
        for (const p of pieces) {
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vr;
            p.vy += 0.02; // gravity

            if (p.y > H + 20) {
                p.y = -20;
                p.x = Math.random() * W;
                p.vy = 2 + Math.random() * 2;
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }

        if (active && t < endTime) {
            requestAnimationFrame(frame);
        } else {
            ctx.clearRect(0, 0, W, H);
        }
    }

    requestAnimationFrame(frame);
}

