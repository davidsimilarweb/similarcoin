// Enhanced Background Script for Navigation Monitoring
chrome.runtime.onInstalled.addListener(() => {
  
  chrome.storage.local.set({
    pagesVisited: 0,
    timeTracked: 0,
    navigationData: [],
    walletState: {
      connected: false,
      account: null,
      lastConnected: null
    }
  });
});

// Comprehensive tab monitoring (fallback + verification)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only process valid URLs and avoid duplicating content script work
  if (changeInfo.status === 'complete' && tab.url && isValidUrl(tab.url)) {
    
    // Use as fallback - only record if content script might have failed
    setTimeout(() => {
      verifyAndFallbackRecord(tab, 'tab_updated');
    }, 1000); // Give content script time to record
  }
});

// Monitor tab activation (user switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && isValidUrl(tab.url)) {
      recordTabActivation(tab);
    }
  } catch (error) {
  }
});

// Monitor window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    recordWindowFocus();
  }
});

// Fallback recording when content script might not be available
function verifyAndFallbackRecord(tab, eventType) {
  if (!isValidUrl(tab.url)) return;
  
  chrome.storage.local.get(['navigationData'], (result) => {
    const navigationData = result.navigationData || [];
    
    // Check if content script already recorded this within last 5 seconds
    const recentRecord = navigationData.some(item => 
      item.url === tab.url && 
      (Date.now() - item.timestamp) < 5000
    );
    
    if (!recentRecord) {
      recordFallbackNavigation(tab, eventType);
    }
  });
}

// Record navigation as fallback when content script fails
function recordFallbackNavigation(tab, eventType) {
  const pageData = {
    url: tab.url,
    title: tab.title || 'Unknown Title',
    domain: new URL(tab.url).hostname,
    timestamp: Date.now(),
    visitStart: Date.now(),
    eventType: `background_${eventType}`,
    timeSpent: 0,
    interactions: 0,
    referrer: null,
    fallback: true // Mark as fallback record
  };

  chrome.storage.local.get(['navigationData', 'pagesVisited'], (result) => {
    const navigationData = result.navigationData || [];
    const pagesVisited = (result.pagesVisited || 0) + 1;
    
    navigationData.push(pageData);
    
    chrome.storage.local.set({ 
      navigationData,
      pagesVisited
    });
    
  });
}

// Record tab activation for better user behavior tracking
function recordTabActivation(tab) {
  const activationData = {
    url: tab.url,
    title: tab.title,
    domain: new URL(tab.url).hostname,
    timestamp: Date.now(),
    eventType: 'tab_activated',
    timeSpent: 0
  };

  chrome.storage.local.get(['navigationData'], (result) => {
    const navigationData = result.navigationData || [];
    
    // Don't duplicate if recently recorded
    const isDuplicate = navigationData.some(item => 
      item.url === activationData.url && 
      Math.abs(item.timestamp - activationData.timestamp) < 2000
    );
    
    if (!isDuplicate) {
      navigationData.push(activationData);
      chrome.storage.local.set({ navigationData });
    }
  });
}

// Track window focus for session context
function recordWindowFocus() {
  chrome.storage.local.get(['sessionEvents'], (result) => {
    const sessionEvents = result.sessionEvents || [];
    sessionEvents.push({
      type: 'window_focus',
      timestamp: Date.now()
    });
    
    // Keep only recent events (last hour)
    const recentEvents = sessionEvents.filter(event => 
      Date.now() - event.timestamp < 3600000
    );
    
    chrome.storage.local.set({ sessionEvents: recentEvents });
  });
}

// Validate URLs to avoid chrome:// and other internal pages
function isValidUrl(url) {
  if (!url) return false;
  
  const invalidPrefixes = [
    'chrome://',
    'chrome-extension://',
    'moz-extension://',
    'about:',
    'edge://',
    'opera://',
    'brave://',
    'data:',
    'blob:'
  ];
  
  return !invalidPrefixes.some(prefix => url.startsWith(prefix));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SUBMIT_DATA') {
    submitDataToBackend(message.data)
      .then(response => sendResponse({ success: true, response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (message.type === 'SAVE_WALLET_STATE') {
    // Save wallet connection state
    chrome.storage.local.set({ walletState: message.walletState }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.type === 'GET_WALLET_STATE') {
    // Retrieve wallet connection state
    chrome.storage.local.get(['walletState'], (result) => {
      sendResponse({ 
        success: true, 
        walletState: result.walletState || { 
          connected: false, 
          account: null, 
          lastConnected: null 
        } 
      });
    });
    return true;
  }
});

async function submitDataToBackend(data) {
  try {
    const response = await fetch('https://similarcoin.onrender.com/api/submit-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      // Try to get the error message from the response
      try {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit data');
      } catch (parseError) {
        throw new Error('Failed to submit data');
      }
    }
    
    return await response.json();
  } catch (error) {
      throw error;
  }
}