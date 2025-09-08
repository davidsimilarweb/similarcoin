let userAccount = null;
let web3Provider = null;

document.addEventListener('DOMContentLoaded', async () => {
    await updateStats();
    await checkWalletConnection();
    
    document.getElementById('connect-btn').addEventListener('click', connectWallet);
    document.getElementById('submit-btn').addEventListener('click', submitData);
    document.getElementById('debug-btn').addEventListener('click', toggleDebugPanel);
    document.getElementById('refresh-debug-btn').addEventListener('click', loadDebugData);
    document.getElementById('clear-debug-btn').addEventListener('click', clearDebugData);
});

async function updateStats() {
    try {
        const data = await chrome.storage.local.get(['pagesVisited', 'timeTracked', 'tokenBalance', 'navigationData']);
        
        document.getElementById('pages-visited').textContent = data.pagesVisited || 0;
        document.getElementById('time-tracked').textContent = data.timeTracked || 0;
        document.getElementById('balance').textContent = data.tokenBalance || 0;
        
        // Add debugging info
        const navDataCount = data.navigationData ? data.navigationData.length : 0;
        const debugInfo = `Debug: ${navDataCount} entries`;
        
        // Add debug element if not exists
        if (!document.getElementById('debug-info')) {
            const debugDiv = document.createElement('div');
            debugDiv.id = 'debug-info';
            debugDiv.style.cssText = 'font-size: 10px; color: #666; margin-top: 5px; cursor: pointer; text-align: center;';
            debugDiv.title = 'Click to view detailed navigation data in console';
            debugDiv.onclick = showDebugData;
            document.querySelector('.stats').appendChild(debugDiv);
        }
        
        document.getElementById('debug-info').textContent = debugInfo;
        
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

async function showDebugData() {
    const data = await chrome.storage.local.get(['navigationData', 'pagesVisited', 'timeTracked']);
    console.log('=== CURRENT NAVIGATION DATA DEBUG ===');
    console.log('Pages visited:', data.pagesVisited);
    console.log('Time tracked:', data.timeTracked);
    console.log('Navigation entries:', data.navigationData ? data.navigationData.length : 0);
    
    if (data.navigationData && data.navigationData.length > 0) {
        console.table(data.navigationData.map(item => ({
            URL: item.url?.substring(0, 50) + '...',
            Domain: item.domain,
            Title: item.title?.substring(0, 30) + '...',
            'Time (min)': item.timeSpent,
            Type: item.eventType,
            Timestamp: new Date(item.timestamp).toLocaleTimeString()
        })));
        
        console.log('Full navigation data:', data.navigationData);
    } else {
        console.log('⚠️ No navigation data found! Extension might need to be reloaded.');
    }
}

async function checkWalletConnection() {
    const ethereum = await getEthereum();
    if (ethereum) {
        try {
            const accounts = await ethereum.request({ method: 'eth_accounts' });
            if (accounts && accounts.length > 0) {
                userAccount = accounts[0];
                updateUI(true);
                await updateTokenBalance();
            }
        } catch (error) {
            console.error('Error checking wallet connection:', error);
        }
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
        
        console.log('Simple MetaMask check:', simpleCheck[0].result);
        
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
                        console.log(`MetaMask detection attempt ${attempts}/${maxAttempts}`);
                        
                        function onAnnouncement(event) {
                            console.log('EIP-6963 provider announced:', event.detail.info);
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
                            console.log('EIP-6963 providers found:', providers.length);
                            console.log('window.ethereum exists:', typeof window.ethereum !== 'undefined');
                            console.log('window.ethereum:', window.ethereum);
                            
                            if (providers.length === 0 && typeof window.ethereum !== 'undefined') {
                                console.log('Adding legacy MetaMask provider');
                                providers.push({
                                    info: { name: 'MetaMask', rdns: 'io.metamask' },
                                    uuid: 'legacy'
                                });
                            }
                            
                            // If no providers found and we have attempts left, try again
                            if (providers.length === 0 && attempts < maxAttempts) {
                                console.log('No providers found, retrying...');
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
        console.log('Detected providers:', providers);
        
        if (providers && providers.length > 0) {
            const metaMaskProvider = providers.find(p => 
                p.info.rdns === 'io.metamask' || p.info.name.includes('MetaMask')
            );
            console.log('MetaMask provider found:', metaMaskProvider);
            
            if (metaMaskProvider) {
                return createEthereumProxy(tab.id, metaMaskProvider.uuid);
            }
        }
        
        return null;
    } catch (error) {
        if (error.message === 'RESTRICTED_URL') {
            console.log('Cannot access MetaMask from this page. Please navigate to a website first.');
        } else {
            console.error('Error detecting MetaMask:', error);
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

async function connectWallet() {
    const ethereum = await getEthereum();
    if (!ethereum) {
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
        const accounts = await ethereum.request({
            method: 'eth_requestAccounts'
        });
        
        userAccount = accounts[0];
        web3Provider = new ethers.BrowserProvider(ethereum);
        
        updateUI(true);
        await updateTokenBalance();
        
        chrome.storage.local.set({ connectedWallet: userAccount });
        
    } catch (error) {
        console.error('Error connecting wallet:', error);
        alert('Failed to connect wallet. Please try again.');
    }
}

async function updateTokenBalance() {
    if (!userAccount) return;
    
    try {
        const contractInfo = await fetch('http://localhost:3000/api/contract-info').then(r => r.json());
        
        if (web3Provider) {
            const contract = new ethers.Contract(
                contractInfo.address,
                contractInfo.abi,
                web3Provider
            );
            
            const balance = await contract.balanceOf(userAccount);
            const decimals = await contract.decimals();
            const formattedBalance = ethers.formatUnits(balance, decimals);
            
            document.getElementById('balance').textContent = parseFloat(formattedBalance).toFixed(2);
            chrome.storage.local.set({ tokenBalance: parseFloat(formattedBalance).toFixed(2) });
        }
    } catch (error) {
        console.error('Error updating token balance:', error);
    }
}

async function submitData() {
    if (!userAccount) {
        alert('Please connect your wallet first!');
        return;
    }

    try {
        const data = await chrome.storage.local.get(['navigationData', 'pagesVisited', 'timeTracked', 'chatgptPrompts']);
        
        console.log('=== NAVIGATION DATA ANALYSIS ===');
        console.log('Raw storage data:', data);
        console.log('Pages visited:', data.pagesVisited);
        console.log('Time tracked:', data.timeTracked);
        console.log('Navigation data entries:', (data.navigationData || []).length);
        console.log('ChatGPT prompts captured:', (data.chatgptPrompts || []).length);
        
        if (data.navigationData && data.navigationData.length > 0) {
            console.log('Navigation data sample:');
            data.navigationData.slice(-5).forEach((item, index) => {
                console.log(`Entry ${index + 1}:`, {
                    url: item.url,
                    title: item.title,
                    domain: item.domain,
                    timeSpent: item.timeSpent,
                    eventType: item.eventType,
                    timestamp: new Date(item.timestamp).toLocaleString()
                });
            });
        } else {
            console.log('⚠️ No navigation data found!');
        }
        
        const submissionData = {
            walletAddress: userAccount,
            pagesVisited: data.pagesVisited || 0,
            timeTracked: data.timeTracked || 0,
            navigationData: data.navigationData || [],
            timestamp: Date.now()
        };
        
        console.log('Submission data:', submissionData);

        document.getElementById('submit-btn').disabled = true;
        document.getElementById('submit-btn').textContent = 'Submitting...';
        document.getElementById('status').innerHTML = '<span style="color: #FFA500;">Processing data submission...</span>';

        chrome.runtime.sendMessage({
            type: 'SUBMIT_DATA',
            data: submissionData
        }, async (response) => {
            console.log('Submission response received:', response);
            
            if (response && response.success) {
                document.getElementById('status').innerHTML = '<span style="color: #4CAF50;">Data submitted successfully! Tokens minted.</span>';
                
                // Clear all collected data after successful submission
                console.log('Clearing local storage after successful submission...');
                
                await new Promise((resolve) => {
                    chrome.storage.local.set({
                        pagesVisited: 0,
                        timeTracked: 0,
                        navigationData: [],
                        chatgptPrompts: []
                    }, () => {
                        console.log('Local storage cleared successfully');
                        resolve();
                    });
                });
                
                await updateStats();
                await updateTokenBalance();
                
                // Refresh debug panel if it's currently open
                const debugPanel = document.getElementById('debug-panel');
                if (debugPanel.classList.contains('active')) {
                    console.log('Refreshing debug panel after data clear...');
                    await loadDebugData();
                }
                
                setTimeout(() => {
                    document.getElementById('status').innerHTML = '<span class="connected">Wallet connected</span>';
                }, 3000);
            } else {
                console.error('Submission failed:', response);
                document.getElementById('status').innerHTML = '<span style="color: #ff6b35;">Failed to submit data. Try again.</span>';
            }
            
            document.getElementById('submit-btn').disabled = false;
            document.getElementById('submit-btn').textContent = 'Submit Data for Tokens';
        });
        
    } catch (error) {
        console.error('Error submitting data:', error);
        document.getElementById('status').innerHTML = '<span style="color: #ff6b35;">Error submitting data</span>';
        document.getElementById('submit-btn').disabled = false;
        document.getElementById('submit-btn').textContent = 'Submit Data for Tokens';
    }
}

function updateUI(connected) {
    const connectBtn = document.getElementById('connect-btn');
    const submitBtn = document.getElementById('submit-btn');
    const status = document.getElementById('status');
    
    if (connected) {
        connectBtn.textContent = `Connected: ${userAccount.slice(0, 6)}...${userAccount.slice(-4)}`;
        connectBtn.style.background = '#4CAF50';
        submitBtn.disabled = false;
        status.innerHTML = '<span class="connected">Wallet connected</span>';
    } else {
        connectBtn.textContent = 'Connect Wallet';
        connectBtn.style.background = '#ff6b35';
        submitBtn.disabled = true;
        status.innerHTML = '<span class="disconnected">Wallet not connected</span>';
    }
}

// Set up event listener for account changes
(async () => {
    const ethereum = await getEthereum();
    if (ethereum) {
        ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                userAccount = null;
                updateUI(false);
            } else {
                userAccount = accounts[0];
                updateUI(true);
                updateTokenBalance();
            }
        });
    }
})();

// Debug panel functionality
async function toggleDebugPanel() {
    const debugPanel = document.getElementById('debug-panel');
    const debugBtn = document.getElementById('debug-btn');
    
    if (debugPanel.classList.contains('active')) {
        debugPanel.classList.remove('active');
        debugBtn.textContent = '🔍 Debug Data';
    } else {
        debugPanel.classList.add('active');
        debugBtn.textContent = '❌ Hide Debug';
        await loadDebugData();
    }
}

async function loadDebugData() {
    try {
        console.log('Loading debug data from storage...');
        const data = await chrome.storage.local.get(['navigationData', 'pagesVisited', 'timeTracked', 'chatgptPrompts']);
        console.log('Raw storage data:', data);
        
        const debugData = {
            summary: {
                pagesVisited: data.pagesVisited || 0,
                timeTracked: data.timeTracked || 0,
                navigationEntries: data.navigationData ? data.navigationData.length : 0,
                chatgptPrompts: data.chatgptPrompts ? data.chatgptPrompts.length : 0
            },
            navigationData: data.navigationData || [],
            chatgptPrompts: data.chatgptPrompts || [],
            timestamp: Date.now()
        };
        
        console.log('Processed debug data:', debugData);
        
        // Update debug stats
        document.getElementById('debug-nav-count').textContent = debugData.summary.navigationEntries;
        document.getElementById('debug-prompt-count').textContent = debugData.summary.chatgptPrompts;
        
        // Calculate data size
        const jsonString = JSON.stringify(debugData, null, 2);
        const sizeInKB = (new Blob([jsonString]).size / 1024).toFixed(1);
        document.getElementById('debug-size').textContent = `${sizeInKB} KB`;
        
        // Display JSON in textarea
        document.getElementById('debug-textarea').value = jsonString;
        
        console.log('Debug panel updated with current data');
        
    } catch (error) {
        console.error('Error loading debug data:', error);
        document.getElementById('debug-textarea').value = `Error loading data: ${error.message}`;
    }
}

// Manual clear data function for testing
async function clearDebugData() {
    console.log('Manually clearing all debug data...');
    chrome.storage.local.set({
        pagesVisited: 0,
        timeTracked: 0,
        navigationData: [],
        chatgptPrompts: []
    }, () => {
        console.log('Manual clear completed');
        loadDebugData(); // Refresh immediately
    });
}