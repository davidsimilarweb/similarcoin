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

    // Check if this is a ChatGPT page and set up prompt monitoring
    console.log('[NavigationTracker] Current URL:', this.currentUrl);
    console.log('[NavigationTracker] Hostname:', window.location.hostname);
    
    if (this.isChatGPTPage()) {
      this.setupChatGPTMonitoring();
    }

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

  // Check if current page is ChatGPT
  isChatGPTPage() {
    return this.currentUrl.includes('chatgpt.com') || 
           this.currentUrl.includes('chat.openai.com') ||
           window.location.hostname.includes('chatgpt.com') ||
           window.location.hostname.includes('chat.openai.com');
  }

  // Set up ChatGPT prompt monitoring
  setupChatGPTMonitoring() {
    // Wait a bit for the page to fully load
    setTimeout(() => {
      this.monitorChatGPTInput();
    }, 2000);
  }

  // Observe ChatGPT interface for new messages
  observeChatGPTInterface() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) { // Element node
              this.extractChatGPTPrompts(node);
            }
          });
        }
      });
    });

    // Start observing the main chat container
    const chatContainer = document.querySelector('main') || document.body;
    observer.observe(chatContainer, {
      childList: true,
      subtree: true
    });

    console.log('[ChatGPT] DOM observer set up');
  }

  // Monitor ChatGPT input areas - simple approach
  monitorChatGPTInput() {
    // Just monitor for Enter key globally on the page
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Wait a moment for the message to be added to DOM
        setTimeout(() => {
          this.findAndCaptureLastUserMessage();
        }, 1000);
      }
    });
  }

  // Find the last user message on the page and capture it
  findAndCaptureLastUserMessage() {
    // Look for user message containers based on your HTML structure
    const userMessageSelectors = [
      '.user-message-bubble-color .whitespace-pre-wrap',
      '[data-message-author-role="user"]',
      '.user-message .whitespace-pre-wrap'
    ];
    
    let lastUserMessage = null;
    let lastTimestamp = 0;
    
    userMessageSelectors.forEach(selector => {
      const messages = document.querySelectorAll(selector);
      
      messages.forEach(msg => {
        // Get the message element's position in DOM to find the "last" one
        const messageText = msg.textContent?.trim();
        if (messageText && messageText.length > 3) {
          // Use DOM position as a rough timestamp proxy
          const rect = msg.getBoundingClientRect();
          const domPosition = rect.top + rect.left;
          
          if (domPosition > lastTimestamp) {
            lastTimestamp = domPosition;
            lastUserMessage = messageText;
          }
        }
      });
    });
    
    if (lastUserMessage) {
      this.captureChatGPTPrompt(lastUserMessage);
    }
  }


  // Extract content from ChatGPT input element
  extractContentFromElement(element) {
    // For ProseMirror editor, get text content and clean it
    let content = element.textContent || element.innerText || element.value || '';
    
    // Remove placeholder text
    if (content === 'Ask anything' || content.includes('ProseMirror-trailingBreak')) {
      return '';
    }
    
    // Clean up the content
    return content.trim();
  }

  // Monitor send buttons near input
  monitorSendButtons(inputElement) {
    // Look for send button in the parent container
    const container = inputElement.closest('form') || inputElement.closest('div[class*="relative"]');
    if (!container) return;

    const sendButtons = container.querySelectorAll('button[data-testid="send-button"], button svg[data-testid="send-button"], button[type="submit"]');
    
    sendButtons.forEach(button => {
      if (!button.dataset.chatgptMonitored) {
        button.dataset.chatgptMonitored = 'true';
        console.log('[ChatGPT] Monitoring send button:', button);
        
        button.addEventListener('click', () => {
          const content = this.extractContentFromElement(inputElement);
          console.log('[ChatGPT] Send button clicked, capturing content:', content?.substring(0, 50));
          this.captureChatGPTPrompt(content);
        });
      }
    });
  }

  // Find the send button near a textarea
  findSendButton(textarea) {
    const parent = textarea.closest('form') || textarea.parentElement;
    if (!parent) return null;

    // Look for send button patterns
    const buttons = parent.querySelectorAll('button');
    for (const button of buttons) {
      const text = button.textContent.toLowerCase();
      const hasIcon = button.querySelector('svg');
      if (text.includes('send') || hasIcon) {
        return button;
      }
    }
    return null;
  }

  // Extract prompts from ChatGPT conversation
  extractChatGPTPrompts(container) {
    // Look ONLY for user message patterns, not AI responses
    const userMessages = container.querySelectorAll('.user-message-bubble-color .whitespace-pre-wrap, [data-message-author-role="user"]');
    
    userMessages.forEach((messageEl) => {
      const messageText = messageEl.textContent?.trim();
      if (messageText && messageText.length > 5 && !this.isSystemOrAIMessage(messageText)) {
        console.log('[ChatGPT] Extracting user prompt:', messageText.substring(0, 50));
        this.captureChatGPTPrompt(messageText);
      }
    });
  }

  // Capture and store ChatGPT prompt
  captureChatGPTPrompt(promptText) {
    if (!promptText || typeof promptText !== 'string') {
      return;
    }
    
    const cleanPrompt = promptText.trim();
    if (cleanPrompt.length < 5) {
      return;
    }

    const promptData = {
      type: 'chatgpt_prompt',
      url: this.currentUrl,
      domain: window.location.hostname,
      prompt: cleanPrompt,
      timestamp: Date.now(),
      conversationId: this.extractConversationId(),
      promptLength: cleanPrompt.length
    };

    // Store in Chrome storage with better duplicate detection
    chrome.storage.local.get(['chatgptPrompts'], (result) => {
      const prompts = result.chatgptPrompts || [];
      
      // Strict duplicate detection - check if exact prompt already exists
      const isDuplicate = prompts.some(p => 
        p.prompt === cleanPrompt || // Exact match
        (p.prompt.includes(cleanPrompt) && cleanPrompt.includes(p.prompt)) || // Similar content
        Math.abs(p.timestamp - promptData.timestamp) < 2000 // Too close in time
      );

      if (isDuplicate) {
        return;
      }

      // Filter out system/AI messages one more time
      if (this.isSystemOrAIMessage(cleanPrompt)) {
        return;
      }

      prompts.push(promptData);
      
      // Keep only recent prompts (last 100)
      if (prompts.length > 100) {
        prompts.splice(0, prompts.length - 100);
      }

      chrome.storage.local.set({ chatgptPrompts: prompts });
    });
  }

  // Extract conversation ID from URL or page
  extractConversationId() {
    const urlMatch = this.currentUrl.match(/\/c\/([^\/\?]+)/);
    if (urlMatch) return urlMatch[1];
    
    // Fallback: generate session-based ID
    return 'session-' + Date.now();
  }

  // Check if message is from system or AI (to avoid capturing responses)
  isSystemOrAIMessage(text) {
    // Filter out common AI response patterns
    const aiPatterns = [
      'window.__oai_log', // Script content
      'I\'m doing great', // AI responses
      'Glad to hear', // AI responses
      'What\'s been the highlight', // AI responses
      'Thanks for asking', // AI responses
      'requestAnimationFrame', // Script content
      '__oai_SSR_', // Script content
      'ProseMirror-trailingBreak' // Editor markup
    ];
    
    return aiPatterns.some(pattern => text.includes(pattern));
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