document.addEventListener('DOMContentLoaded', () => {
    const domainCountEl = document.getElementById('domain-count');
    const historyCountEl = document.getElementById('history-count');
    const refreshStatsBtn = document.getElementById('refresh-stats');
    const messageEl = document.getElementById('message');
    const clearButtons = document.querySelectorAll('.clear-item-btn');

    async function loadStats() {
        try {
            const stats = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
                    resolve(response);
                });
            });

            if (stats) {
                domainCountEl.textContent = stats.domainCount;
                historyCountEl.textContent = stats.historyCount;

                updateButtonStates(stats);
            } else {
                showMessage('Failed to get statistics', 'error');
            }
        } catch (error) {
            showMessage('Error getting statistics: ' + error.message, 'error');
        }
    }

    function updateButtonStates(stats) {
        clearButtons.forEach(button => {
            const type = button.getAttribute('data-type');
            const count = type === 'domains' ? stats.domainCount : stats.historyCount;
            button.disabled = count === 0;
        });
    }

    function showMessage(text, type) {
        messageEl.textContent = text;
        messageEl.className = 'message ' + type;
        messageEl.style.display = 'block';

        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 5000);
    }

    async function clearData(type) {
        const clearHistory = type === 'history';
        const clearDomains = type === 'domains';

        const dataTypeName = type === 'history' ? 'History Records' : 'Domain Records';

        if (!confirm(`Are you sure you want to clear ${dataTypeName}? This action cannot be undone!`)) {
            return;
        }

        const button = document.querySelector(`.clear-item-btn[data-type="${type}"]`);
        const originalText = button.textContent;

        try {
            button.disabled = true;
            button.textContent = 'Clearing...';

            const result = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'clearData',
                    clearHistory: clearHistory,
                    clearDomains: clearDomains
                }, (response) => {
                    resolve(response);
                });
            });

            if (result && result.success) {
                showMessage(`${dataTypeName} cleared successfully`, 'success');

                chrome.tabs.query({}, (tabs) => {
                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'refreshLinks'
                        }).catch(() => { });
                    });
                });
            } else {
                showMessage(`Failed to clear ${dataTypeName}`, 'error');
            }

        } catch (error) {
            showMessage(`Error clearing ${dataTypeName}: ` + error.message, 'error');
        } finally {
            button.textContent = originalText;
            loadStats();
        }
    }

    refreshStatsBtn.addEventListener('click', loadStats);

    clearButtons.forEach(button => {
        button.addEventListener('click', () => {
            const type = button.getAttribute('data-type');
            clearData(type);
        });
    });

    loadStats();
});