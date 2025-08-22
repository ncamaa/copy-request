// Panel script for Copy Detailed Req/Res DevTools extension
// This handles the display and copying of network requests in the DevTools panel

let capturedRequests = [];
let requestsContainer;
let successMessage;

// Initialize the panel when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    requestsContainer = document.getElementById('requests-container');
    successMessage = document.getElementById('success-message');
    
    // Listen for network requests from the content script
    setupNetworkListener();
    
    // Update display
    updateRequestsList();
});

function setupNetworkListener() {
    // Listen for messages from content script about captured requests
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'NETWORK_REQUEST_CAPTURED') {
            addCapturedRequest(message.data);
            sendResponse({ success: true });
        }
    });
    
    // Also listen for requests via the injected script method
    // Connect to the active tab to get network data
    chrome.devtools.inspectedWindow.eval(`
        // Check if our extension is already injected
        if (window.__copyReqResExtension) {
            window.__copyReqResExtension.getStoredRequests();
        }
    `, function(result, isException) {
        if (!isException && result) {
            result.forEach(req => addCapturedRequest(req));
        }
    });
}

function addCapturedRequest(requestData) {
    // Add timestamp if not present
    if (!requestData.capturedAt) {
        requestData.capturedAt = new Date().toISOString();
    }
    
    // Add to beginning of array (most recent first)
    capturedRequests.unshift(requestData);
    
    // Keep only last 50 requests to avoid memory issues
    if (capturedRequests.length > 50) {
        capturedRequests = capturedRequests.slice(0, 50);
    }
    
    updateRequestsList();
}

function updateRequestsList() {
    if (!requestsContainer) return;
    
    if (capturedRequests.length === 0) {
        requestsContainer.innerHTML = `
            <div class="no-requests">
                No network requests captured yet.<br>
                Navigate to the Network tab and refresh the page or interact with it to see requests here.
            </div>
        `;
        return;
    }
    
    let html = '';
    capturedRequests.forEach((request, index) => {
        const method = request.request?.method || 'GET';
        const url = request.request?.url || request.request?.path || 'Unknown URL';
        const status = request.response?.status || 'Unknown';
        const statusClass = getStatusClass(status);
        const timestamp = new Date(request.capturedAt).toLocaleTimeString();
        
        // Truncate long URLs for display
        const displayUrl = url.length > 80 ? url.substring(0, 80) + '...' : url;
        
        html += `
            <div class="request-item" onclick="copyRequest(${index})">
                <span class="request-method">${method}</span>
                <span class="request-url">${displayUrl}</span>
                <span class="request-status ${statusClass}">${status}</span>
                <button class="copy-button" onclick="event.stopPropagation(); copyRequest(${index})">Copy</button>
                <div style="font-size: 12px; color: #666; margin-top: 4px;">
                    ${timestamp} • ${request.transport || 'unknown'}
                </div>
            </div>
        `;
    });
    
    requestsContainer.innerHTML = html;
}

function getStatusClass(status) {
    const statusNum = parseInt(status);
    if (statusNum >= 200 && statusNum < 300) return 'status-200';
    if (statusNum >= 300 && statusNum < 400) return 'status-300';
    if (statusNum >= 400 && statusNum < 500) return 'status-400';
    if (statusNum >= 500) return 'status-500';
    return '';
}

function copyRequest(index) {
    if (index >= capturedRequests.length) return;
    
    const request = capturedRequests[index];
    const jsonString = JSON.stringify(request, null, 2);
    
    // Use the clipboard API to copy
    navigator.clipboard.writeText(jsonString).then(() => {
        showSuccessMessage();
        console.log('Request details copied to clipboard');
    }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
        
        // Fallback: try using the chrome.devtools API
        chrome.devtools.inspectedWindow.eval(`
            navigator.clipboard.writeText(${JSON.stringify(jsonString)}).then(() => {
                console.log('Request copied via inspected window');
            }).catch(console.error);
        `);
    });
}

function showSuccessMessage() {
    if (successMessage) {
        successMessage.style.display = 'block';
        setTimeout(() => {
            successMessage.style.display = 'none';
        }, 2000);
    }
}

// Expose global function for external access
window.copyRequest = copyRequest;

