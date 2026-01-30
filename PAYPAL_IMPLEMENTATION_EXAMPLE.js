// 🚀 PayPal Subscription Implementation Examples
// Add these to your extension's popup.js or background.js

// ============================================
// 1. CONFIGURATION
// ============================================

// Update this to your Render.com URL
const API_BASE_URL = 'https://group-posting-pro-backend.onrender.com';

// PayPal Plan IDs (get these from your PayPal Developer account)
const PAYPAL_PLANS = {
    BASIC: 'P-YOUR_PLAN_ID_HERE',      // e.g., "P-1234567890ABCDEF"
    PREMIUM: 'P-PREMIUM_PLAN_ID',
    ENTERPRISE: 'P-ENTERPRISE_PLAN_ID'
};

// ============================================
// 2. CREATE SUBSCRIPTION
// ============================================

async function createPayPalSubscription(planId, userEmail, userName) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/paypal/create-subscription`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                planId: planId,
                subscriberEmail: userEmail,
                subscriberName: userName
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to create subscription');
        }

        console.log('✓ Subscription created:', data.subscriptionId);

        // Open PayPal approval URL in new window
        if (data.approvalLink) {
            window.open(data.approvalLink, '_blank');
        }

        // Store subscription ID for future use
        chrome.storage.local.set({
            paypalSubscriptionId: data.subscriptionId,
            subscriptionCreatedAt: new Date().toISOString()
        });

        return data;

    } catch (error) {
        console.error('✗ Error creating subscription:', error);
        throw error;
    }
}

// ============================================
// 3. VALIDATE SUBSCRIPTION
// ============================================

async function validatePayPalSubscription(subscriptionId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/paypal/validate-subscription`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subscriptionId: subscriptionId
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to validate subscription');
        }

        const subscription = data.subscription;
        console.log('✓ Subscription validated:', {
            id: subscription.id,
            status: subscription.status,
            email: subscription.subscriber?.email_address,
            createdAt: subscription.createdAt
        });

        // Update storage with subscription status
        chrome.storage.local.set({
            paypalSubscriptionStatus: subscription.status,
            paypalSubscriptionData: subscription
        });

        return data;

    } catch (error) {
        console.error('✗ Error validating subscription:', error);
        throw error;
    }
}

// ============================================
// 4. CHECK SUBSCRIPTION STATUS
// ============================================

async function checkSubscriptionStatus() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['paypalSubscriptionId'], async (result) => {
            if (!result.paypalSubscriptionId) {
                console.log('No subscription found');
                resolve(null);
                return;
            }

            try {
                const data = await validatePayPalSubscription(result.paypalSubscriptionId);
                const status = data.subscription?.status;

                resolve({
                    subscriptionId: result.paypalSubscriptionId,
                    status: status,
                    isActive: status === 'ACTIVE' || status === 'APPROVAL_PENDING'
                });
            } catch (error) {
                console.error('Failed to check status:', error);
                resolve({ isActive: false, error: error.message });
            }
        });
    });
}

// ============================================
// 5. CANCEL SUBSCRIPTION
// ============================================

async function cancelPayPalSubscription(subscriptionId, reason = 'User requested cancellation') {
    try {
        const response = await fetch(`${API_BASE_URL}/api/paypal/cancel-subscription`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subscriptionId: subscriptionId,
                reason: reason
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to cancel subscription');
        }

        console.log('✓ Subscription cancelled:', subscriptionId);

        // Clear subscription from storage
        chrome.storage.local.set({
            paypalSubscriptionId: null,
            paypalSubscriptionStatus: 'CANCELLED'
        });

        return data;

    } catch (error) {
        console.error('✗ Error cancelling subscription:', error);
        throw error;
    }
}

// ============================================
// 6. UI BUTTON HANDLERS (for popup.html)
// ============================================

// Example: Subscribe button click handler
document.addEventListener('DOMContentLoaded', () => {

    // Subscribe button
    const subscribeBtn = document.getElementById('subscribeBtn');
    if (subscribeBtn) {
        subscribeBtn.addEventListener('click', async () => {
            try {
                // Get user email (you'll need to collect this)
                const userEmail = document.getElementById('userEmail')?.value;
                const userName = document.getElementById('userName')?.value || 'Premium User';

                if (!userEmail) {
                    alert('Please enter your email address');
                    return;
                }

                subscribeBtn.disabled = true;
                subscribeBtn.textContent = 'Creating subscription...';

                await createPayPalSubscription(PAYPAL_PLANS.PREMIUM, userEmail, userName);

                subscribeBtn.textContent = 'Opening PayPal...';
            } catch (error) {
                alert('Error: ' + error.message);
                subscribeBtn.disabled = false;
                subscribeBtn.textContent = 'Subscribe Now';
            }
        });
    }

    // Check status button
    const checkStatusBtn = document.getElementById('checkStatusBtn');
    if (checkStatusBtn) {
        checkStatusBtn.addEventListener('click', async () => {
            try {
                const status = await checkSubscriptionStatus();
                if (status && status.isActive) {
                    alert(`✓ Active Subscription\nID: ${status.subscriptionId}`);
                } else {
                    alert('No active subscription found');
                }
            } catch (error) {
                alert('Error checking status: ' + error.message);
            }
        });
    }

    // Cancel button
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
            const confirmed = confirm('Are you sure you want to cancel your subscription?');
            if (!confirmed) return;

            try {
                const result = await chrome.storage.local.get(['paypalSubscriptionId']);
                if (!result.paypalSubscriptionId) {
                    alert('No subscription to cancel');
                    return;
                }

                cancelBtn.disabled = true;
                cancelBtn.textContent = 'Cancelling...';

                await cancelPayPalSubscription(result.paypalSubscriptionId);

                alert('✓ Subscription cancelled successfully');
                cancelBtn.textContent = 'Cancel Subscription';
                cancelBtn.disabled = false;
            } catch (error) {
                alert('Error: ' + error.message);
                cancelBtn.disabled = false;
                cancelBtn.textContent = 'Cancel Subscription';
            }
        });
    }
});

// ============================================
// 7. AUTO-CHECK ON EXTENSION LOAD
// ============================================

// Check subscription status when extension popup opens
chrome.runtime.onStartup?.addListener(async () => {
    console.log('🔄 Checking subscription status...');
    const status = await checkSubscriptionStatus();
    if (status?.isActive) {
        console.log('✓ Subscription is active');
    } else {
        console.log('⚠ Subscription not active');
    }
});

// ============================================
// 8. EXAMPLE HTML (popup.html)
// ============================================

const exampleHTML = `
<!-- Subscription Section -->
<div id="subscriptionSection" class="card">
    <h3>🎯 Premium Subscription</h3>
    
    <div class="form-group">
        <label for="userEmail">Email:</label>
        <input type="email" id="userEmail" placeholder="you@example.com">
    </div>
    
    <div class="form-group">
        <label for="userName">Full Name:</label>
        <input type="text" id="userName" placeholder="John Doe">
    </div>
    
    <div class="button-group">
        <button id="subscribeBtn" class="btn btn-primary">
            💳 Subscribe ($9.99/month)
        </button>
        <button id="checkStatusBtn" class="btn btn-secondary">
            ✓ Check Status
        </button>
        <button id="cancelBtn" class="btn btn-danger">
            ✗ Cancel Subscription
        </button>
    </div>
</div>
`;

// ============================================
// 9. ERROR HANDLING & LOGGING
// ============================================

// Global error handler for API calls
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    // You could send this to your logging service
});

// ============================================
// 10. STORAGE MANAGEMENT
// ============================================

// Clear all subscription data
async function clearSubscriptionData() {
    chrome.storage.local.set({
        paypalSubscriptionId: null,
        paypalSubscriptionStatus: null,
        paypalSubscriptionData: null,
        subscriptionCreatedAt: null
    });
}

// Get all subscription data
async function getSubscriptionData() {
    return new Promise((resolve) => {
        chrome.storage.local.get([
            'paypalSubscriptionId',
            'paypalSubscriptionStatus',
            'paypalSubscriptionData'
        ], resolve);
    });
}

// Export functions for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createPayPalSubscription,
        validatePayPalSubscription,
        checkSubscriptionStatus,
        cancelPayPalSubscription,
        clearSubscriptionData,
        getSubscriptionData
    };
}
