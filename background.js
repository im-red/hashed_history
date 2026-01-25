const MAX_HISTORY_SIZE = 10000;

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

function getDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return '';
  }
}

function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    urlObj.search = '';
    return urlObj.toString();
  } catch (error) {
    return url;
  }
}

async function processUrl(url) {
  const normalizedUrl = normalizeUrl(url);
  const hashedUrl = await sha256(normalizedUrl);
  return hashedUrl;
}

async function processDomain(url) {
  const domain = getDomainFromUrl(url);
  if (!domain) return null;
  const hashedDomain = await sha256(domain);
  return hashedDomain;
}

async function isDomainEnabled(url) {
  const hashedDomain = await processDomain(url);
  if (!hashedDomain) return false;

  const result = await chrome.storage.local.get(['enabledDomains']);
  const enabledDomains = result.enabledDomains || [];
  return enabledDomains.includes(hashedDomain);
}

async function addToHistory(hashedUrl) {
  const result = await chrome.storage.local.get(['visitedUrls']);
  let visitedUrls = result.visitedUrls || [];

  if (!visitedUrls.includes(hashedUrl)) {
    visitedUrls.push(hashedUrl);

    if (visitedUrls.length > MAX_HISTORY_SIZE) {
      visitedUrls = visitedUrls.slice(-MAX_HISTORY_SIZE);
    }

    await chrome.storage.local.set({ visitedUrls });
  }
}

async function toggleDomainRecording(url, enable) {
  const hashedDomain = await processDomain(url);
  if (!hashedDomain) return false;

  const result = await chrome.storage.local.get(['enabledDomains']);
  let enabledDomains = result.enabledDomains || [];

  if (enable) {
    if (!enabledDomains.includes(hashedDomain)) {
      enabledDomains.push(hashedDomain);
    }
  } else {
    enabledDomains = enabledDomains.filter(domain => domain !== hashedDomain);
  }

  await chrome.storage.local.set({ enabledDomains });
  return true;
}

async function getDomainRecordingStatus(url) {
  const hashedDomain = await processDomain(url);
  if (!hashedDomain) return false;

  const result = await chrome.storage.local.get(['enabledDomains']);
  const enabledDomains = result.enabledDomains || [];
  return enabledDomains.includes(hashedDomain);
}

async function handleUrlRecording(url, tabId) {
  try {
    const enabled = await isDomainEnabled(url);
    if (!enabled) return;

    const hashedUrl = await processUrl(url);
    await addToHistory(hashedUrl);

    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id !== tabId) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'updateLinks',
            visitedUrls: [hashedUrl]
          }).catch(() => { });
        }
      });
    });
  } catch (error) {
    console.error('Error processing URL:', error);
  }
}

chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  if (details.sourceFrameId === 0 && details.tabId > 0) {
    await handleUrlRecording(details.url, details.tabId);
  }
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId === 0 && details.transitionType !== 'auto_subframe') {
    await handleUrlRecording(details.url, details.tabId);
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.status === 'complete') {
      chrome.tabs.sendMessage(activeInfo.tabId, {
        action: 'refreshLinks'
      }).catch(() => { });
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, {
      action: 'refreshLinks'
    }).catch(() => { });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getVisitedUrls') {
    chrome.storage.local.get(['visitedUrls']).then(result => {
      sendResponse({ visitedUrls: result.visitedUrls || [] });
    });
    return true;
  } else if (request.action === 'toggleDomainRecording') {
    toggleDomainRecording(request.url, request.enable).then(success => {
      sendResponse({ success });
    });
    return true;
  } else if (request.action === 'getDomainRecordingStatus') {
    getDomainRecordingStatus(request.url).then(enabled => {
      sendResponse({ enabled });
    });
    return true;
  } else if (request.action === 'getStats') {
    chrome.storage.local.get(['visitedUrls', 'enabledDomains']).then(result => {
      const stats = {
        historyCount: (result.visitedUrls || []).length,
        domainCount: (result.enabledDomains || []).length
      };
      sendResponse(stats);
    });
    return true;
  } else if (request.action === 'clearData') {
    const clearHistory = request.clearHistory || false;
    const clearDomains = request.clearDomains || false;

    chrome.storage.local.get(['visitedUrls', 'enabledDomains']).then(result => {
      const updates = {};

      if (clearHistory) {
        updates.visitedUrls = [];
      }

      if (clearDomains) {
        updates.enabledDomains = [];
      }

      chrome.storage.local.set(updates).then(() => {
        sendResponse({ success: true });
      });
    });
    return true;
  }
});