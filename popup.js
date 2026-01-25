document.addEventListener('DOMContentLoaded', async () => {
    const currentDomainEl = document.getElementById('current-domain');
    const toggleBtn = document.getElementById('toggle-btn');
    const statusEl = document.getElementById('status');

    async function getCurrentTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    }

    async function updatePopup() {
        try {
            const tab = await getCurrentTab();
            if (!tab || !tab.url) {
                currentDomainEl.textContent = 'Unable to get current page information';
                toggleBtn.disabled = true;
                toggleBtn.textContent = 'Cannot operate';
                return;
            }

            const url = tab.url;
            const domain = new URL(url).hostname;
            currentDomainEl.textContent = domain;

            chrome.runtime.sendMessage({
                action: 'getDomainRecordingStatus',
                url: url
            }, (response) => {
                if (response && response.enabled !== undefined) {
                    updateToggleButton(response.enabled);
                } else {
                    statusEl.textContent = 'Failed to get status';
                    toggleBtn.disabled = true;
                }
            });

        } catch (error) {
            currentDomainEl.textContent = 'Error: ' + error.message;
            toggleBtn.disabled = true;
            toggleBtn.textContent = 'Error';
        }
    }

    function updateToggleButton(isRecording) {
        toggleBtn.disabled = false;

        if (isRecording) {
            toggleBtn.textContent = 'Stop Recording This Domain';
            toggleBtn.classList.add('recording');
            statusEl.textContent = 'Recording visit history for this domain';
            statusEl.style.color = '#d32f2f';
        } else {
            toggleBtn.textContent = 'Start Recording This Domain';
            toggleBtn.classList.remove('recording');
            statusEl.textContent = 'Not recording visit history for this domain';
            statusEl.style.color = '#666';
        }
    }

    toggleBtn.addEventListener('click', async () => {
        try {
            const tab = await getCurrentTab();
            if (!tab || !tab.url) return;

            const currentStatus = toggleBtn.classList.contains('recording');
            const newStatus = !currentStatus;

            toggleBtn.disabled = true;
            toggleBtn.textContent = 'Processing...';

            chrome.runtime.sendMessage({
                action: 'toggleDomainRecording',
                url: tab.url,
                enable: newStatus
            }, (response) => {
                if (response && response.success) {
                    updateToggleButton(newStatus);

                    chrome.tabs.sendMessage(tab.id, {
                        action: 'refreshLinks'
                    }).catch(() => { });
                } else {
                    statusEl.textContent = 'Operation failed, please try again';
                    updateToggleButton(currentStatus);
                }
            });

        } catch (error) {
            statusEl.textContent = 'Operation failed: ' + error.message;
            updatePopup();
        }
    });

    updatePopup();
});