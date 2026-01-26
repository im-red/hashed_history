async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
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

async function getVisitedUrls() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getVisitedUrls' }, (response) => {
            resolve(response.visitedUrls || []);
        });
    });
}

async function markVisitedLinks(additionalUrls = []) {
    let visitedUrls = await getVisitedUrls();

    if (additionalUrls.length > 0) {
        visitedUrls = [...new Set([...visitedUrls, ...additionalUrls])];
    }

    const currentDomain = window.location.hostname;
    const isDomainEnabled = await checkDomainEnabled(currentDomain);

    if (!isDomainEnabled) {
        return;
    }

    const links = document.querySelectorAll('a[href]');

    for (const link of links) {
        try {
            const href = link.href;
            if (!href) continue;

            const normalizedUrl = normalizeUrl(href);
            const hashedUrl = await sha256(normalizedUrl);

            if (visitedUrls.includes(hashedUrl)) {
                link.style.color = '#A0A0A0';
                link.style.textDecoration = 'line-through';
            }
        } catch (error) {
            continue;
        }
    }
}

async function checkDomainEnabled(domain) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: 'checkDomainEnabled',
            domain: domain
        }, (response) => {
            resolve(response?.enabled || false);
        });
    });
}

function observeDOMChanges() {
    const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;

        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.tagName === 'A' || node.querySelector('a')) {
                            shouldCheck = true;
                            break;
                        }
                    }
                }
            }

            if (shouldCheck) break;
        }

        if (shouldCheck) {
            markVisitedLinks();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateLinks') {
        markVisitedLinks(request.visitedUrls);
    } else if (request.action === 'refreshLinks') {
        markVisitedLinks();
    }
});

markVisitedLinks();
observeDOMChanges();