// Enhanced Navigation Tracking with Event-Driven Architecture
class NavigationTracker {
  constructor() {
    this.pageStartTime = Date.now();
    this.isPageActive = true;
    this.currentUrl = window.location.href;
    this.sessionData = {
      timeSpent: 0,
      interactions: 0
    };
    
    this.init();
  }

  init() {
    // Record initial page visit
    this.recordPageVisit('initial_load');
    
    // Set up all event listeners
    this.setupNavigationListeners();
    this.setupVisibilityListeners();
    this.setupHistoryInterception();
    this.setupPageLifecycleListeners();
    
    console.log('[NavigationTracker] Initialized for:', this.currentUrl);
  }

  // Comprehensive navigation event listeners
  setupNavigationListeners() {
    // Browser navigation events
    window.addEventListener('popstate', (e) => {
      this.handleNavigation('popstate', e);
    });
    
    // Hash changes (for fragment navigation)
    window.addEventListener('hashchange', (e) => {
      this.handleNavigation('hashchange', e);
    });
    
    // Page loading events
    document.addEventListener('DOMContentLoaded', () => {
      this.recordPageVisit('dom_loaded');
    });
    
    window.addEventListener('load', () => {
      this.recordPageVisit('fully_loaded');
    });
  }

  // Page visibility and lifecycle events
  setupVisibilityListeners() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.handlePageHidden();
      } else {
        this.handlePageVisible();
      }
    });

    window.addEventListener('focus', () => {
      this.handlePageVisible();
    });

    window.addEventListener('blur', () => {
      this.handlePageHidden();
    });

    // Page exit events
    window.addEventListener('beforeunload', (e) => {
      this.finalizePageSession('beforeunload');
    });

    window.addEventListener('pagehide', (e) => {
      this.finalizePageSession('pagehide');
    });
  }

  // Intercept History API for SPA navigation
  setupHistoryInterception() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      // Small delay to ensure URL has changed
      setTimeout(() => this.handleNavigation('pushstate'), 0);
    };
    
    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      setTimeout(() => this.handleNavigation('replacestate'), 0);
    };
  }

  // Additional page lifecycle monitoring
  setupPageLifecycleListeners() {
    // User interactions to improve time tracking accuracy
    ['click', 'scroll', 'keydown'].forEach(event => {
      document.addEventListener(event, () => {
        this.sessionData.interactions++;
        this.isPageActive = true;
      }, { passive: true });
    });
  }

  // Handle navigation events
  handleNavigation(type, event = null) {
    const newUrl = window.location.href;
    
    if (newUrl !== this.currentUrl) {
      console.log(`[NavigationTracker] Navigation detected (${type}):`, newUrl);
      
      // Finalize current page session
      this.finalizePageSession(type);
      
      // Start new page session
      this.currentUrl = newUrl;
      this.pageStartTime = Date.now();
      this.isPageActive = true;
      this.sessionData = { timeSpent: 0, interactions: 0 };
      
      // Record new page visit
      this.recordPageVisit(type);
    }
  }

  // Handle page becoming visible
  handlePageVisible() {
    if (!this.isPageActive) {
      console.log('[NavigationTracker] Page became active');
      this.pageStartTime = Date.now();
      this.isPageActive = true;
    }
  }

  // Handle page becoming hidden
  handlePageHidden() {
    if (this.isPageActive) {
      console.log('[NavigationTracker] Page became inactive');
      this.updateTimeSpent();
      this.isPageActive = false;
    }
  }

  // Record a new page visit
  recordPageVisit(eventType = 'unknown') {
    const pageData = {
      url: this.currentUrl,
      title: document.title || 'Unknown Title',
      domain: window.location.hostname,
      timestamp: Date.now(),
      visitStart: this.pageStartTime,
      eventType: eventType,
      timeSpent: 0,
      interactions: 0,
      referrer: document.referrer || null
    };

    chrome.storage.local.get(['navigationData'], (result) => {
      const navigationData = result.navigationData || [];
      
      // Avoid duplicates within 5 seconds
      const isDuplicate = navigationData.some(item => 
        item.url === pageData.url && 
        Math.abs(item.timestamp - pageData.timestamp) < 5000
      );
      
      if (!isDuplicate) {
        navigationData.push(pageData);
        chrome.storage.local.set({ navigationData });
        console.log(`[NavigationTracker] Recorded visit (${eventType}):`, pageData);
        
        // Update page counter
        this.updatePageCounter();
      }
    });
  }

  // Update time spent on current page
  updateTimeSpent() {
    if (!this.isPageActive) return;
    
    const currentTime = Date.now();
    const timeSpentMs = currentTime - this.pageStartTime;
    const timeSpentMinutes = Math.max(Math.round(timeSpentMs / 1000 / 60), 1);
    
    this.sessionData.timeSpent = timeSpentMinutes;
    
    chrome.storage.local.get(['timeTracked', 'navigationData'], (result) => {
      // Update total time
      const totalTime = (result.timeTracked || 0) + timeSpentMinutes;
      
      // Update current page entry
      const navigationData = result.navigationData || [];
      const currentEntry = navigationData
        .reverse()
        .find(item => item.url === this.currentUrl);
      
      if (currentEntry) {
        currentEntry.timeSpent = timeSpentMinutes;
        currentEntry.interactions = this.sessionData.interactions;
        currentEntry.timeEnd = currentTime;
      }
      
      chrome.storage.local.set({
        timeTracked: totalTime,
        navigationData: navigationData.reverse()
      });
    });
  }

  // Finalize current page session
  finalizePageSession(eventType = 'unknown') {
    if (this.isPageActive) {
      console.log(`[NavigationTracker] Finalizing session (${eventType}):`, this.currentUrl);
      this.updateTimeSpent();
    }
  }

  // Update page visit counter
  updatePageCounter() {
    chrome.storage.local.get(['pagesVisited'], (result) => {
      const pagesVisited = (result.pagesVisited || 0) + 1;
      chrome.storage.local.set({ pagesVisited });
    });
  }
}

// Initialize the navigation tracker
const navigationTracker = new NavigationTracker();

// EIP-6963 wallet detection
let detectedProviders = [];

function detectEIP6963Providers() {
    return new Promise((resolve) => {
        const providers = [];
        
        // Listen for wallet providers
        function onAnnouncement(event) {
            providers.push({
                info: event.detail.info,
                provider: event.detail.provider,
                uuid: event.detail.info.uuid
            });
        }
        
        window.addEventListener('eip6963:announceProvider', onAnnouncement);
        
        // Request providers
        window.dispatchEvent(new Event('eip6963:requestProvider'));
        
        // Give providers time to respond
        setTimeout(() => {
            window.removeEventListener('eip6963:announceProvider', onAnnouncement);
            detectedProviders = providers;
            resolve(providers);
        }, 100);
    });
}

// Handle messages from popup for MetaMask communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'CHECK_METAMASK') {
        sendResponse({ hasMetaMask: typeof window.ethereum !== 'undefined' });
    } else if (request.type === 'DETECT_WALLETS') {
        detectEIP6963Providers().then(providers => {
            // Also check for legacy window.ethereum
            if (providers.length === 0 && typeof window.ethereum !== 'undefined') {
                providers.push({
                    info: { name: 'MetaMask', rdns: 'io.metamask', uuid: 'legacy' },
                    provider: window.ethereum,
                    uuid: 'legacy'
                });
            }
            sendResponse({ providers });
        });
        return true; // Keep channel open for async response
    } else if (request.type === 'METAMASK_REQUEST') {
        const providerUuid = request.providerUuid;
        let provider;
        
        if (providerUuid === 'legacy' && typeof window.ethereum !== 'undefined') {
            provider = window.ethereum;
        } else {
            const providerObj = detectedProviders.find(p => p.uuid === providerUuid);
            provider = providerObj?.provider;
        }
        
        if (provider) {
            provider.request(request.params)
                .then(result => sendResponse({ result }))
                .catch(error => sendResponse({ error: error.message }));
        } else {
            sendResponse({ error: 'MetaMask provider not found' });
        }
        return true; // Keep the message channel open for async response
    }
});