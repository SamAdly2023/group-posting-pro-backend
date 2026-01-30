require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// PayPal Configuration
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || '';
const PAYPAL_API_URL = process.env.NODE_ENV === 'production'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com';

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Helper function to get PayPal access token
async function getPayPalAccessToken() {
    try {
        const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
        const response = await axios.post(`${PAYPAL_API_URL}/v1/oauth2/token`,
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error('[PayPal Token Error]', error.message);
        throw error;
    }
}

// --- Health Check Endpoint for Render.com ---
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        message: 'Group Posting Pro Backend Server by Sam Adly',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// --- API Key & DeepSeek ---

// Mimics: https://groupposting.com/wp-json/groupposting/v1/get-api-key
app.post('/api/get-api-key', (req, res) => {
    console.log('[API Key Request]', req.body);
    // You can implement your own validation logic here.
    // For now, we return a success with a placeholder key.
    // If you have your own DeepSeek key, put it here, or prompt the user to enter it in the UI.

    // In a real scenario, you probably want to use a proxy so the key isn't exposed to the client,
    // but the original extension architecture asks for the key.

    res.json({
        success: true,
        api_key: "sk-YOUR_DEEPSEEK_API_KEY", // Replace with actual key or logic
        expires: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30) // 30 days
    });
});

// --- License Verification ---

// Mimics: https://api.lemonsqueezy.com/v1/licenses/activate
app.post('/api/lemonsqueezy/activate', (req, res) => {
    console.log('[LemonSqueezy Activate]', req.body);
    res.json({
        activated: true,
        license_key: {
            status: "active",
            key: req.body.license_key
        },
        meta: {
            // Any other meta data expected
        }
    });
});

// Mimics: https://api.lemonsqueezy.com/v1/licenses/validate
app.post('/api/lemonsqueezy/validate', (req, res) => {
    console.log('[LemonSqueezy Validate]', req.body);
    res.json({
        valid: true,
        meta: {}
    });
});

// Mimics: https://api.gumroad.com/v2/licenses/verify
app.post('/api/gumroad/verify', (req, res) => {
    console.log('[Gumroad Verify]', req.body);

    // The original extension checks for specific email or date range.
    // Since we are modifying the extension to remove that check, we just return success.
    res.json({
        success: true,
        purchase: {
            email: "activated@example.com",
            created_at: new Date().toISOString(),
            // Ensure this is "valid" according to whatever logic exists, 
            // though we will patch the logic in background.js to ignore specifics.
        }
    });
});

// --- PayPal Subscription Management ---

// Create a subscription plan
app.post('/api/paypal/create-subscription', async (req, res) => {
    try {
        const { planId, subscriberEmail, subscriberName } = req.body;

        if (!planId || !subscriberEmail) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: planId, subscriberEmail'
            });
        }

        const accessToken = await getPayPalAccessToken();

        const subscriptionData = {
            plan_id: planId,
            subscriber: {
                name: {
                    given_name: subscriberName || 'Customer'
                },
                email_address: subscriberEmail
            }
        };

        const response = await axios.post(
            `${PAYPAL_API_URL}/v1/billing/subscriptions`,
            subscriptionData,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('[PayPal Subscription Created]', response.data.id);

        res.json({
            success: true,
            subscriptionId: response.data.id,
            approvalLink: response.data.links?.find(l => l.rel === 'approve')?.href
        });
    } catch (error) {
        console.error('[PayPal Subscription Error]', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create subscription'
        });
    }
});

// Validate/Get subscription details
app.post('/api/paypal/validate-subscription', async (req, res) => {
    try {
        const { subscriptionId } = req.body;

        if (!subscriptionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing subscriptionId'
            });
        }

        const accessToken = await getPayPalAccessToken();

        const response = await axios.get(
            `${PAYPAL_API_URL}/v1/billing/subscriptions/${subscriptionId}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('[PayPal Subscription Validated]', subscriptionId);

        res.json({
            success: true,
            subscription: {
                id: response.data.id,
                status: response.data.status,
                subscriber: response.data.subscriber,
                billingCycles: response.data.billing_cycles,
                createdAt: response.data.create_time
            }
        });
    } catch (error) {
        console.error('[PayPal Validation Error]', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to validate subscription'
        });
    }
});

// Cancel subscription
app.post('/api/paypal/cancel-subscription', async (req, res) => {
    try {
        const { subscriptionId, reason } = req.body;

        if (!subscriptionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing subscriptionId'
            });
        }

        const accessToken = await getPayPalAccessToken();

        await axios.post(
            `${PAYPAL_API_URL}/v1/billing/subscriptions/${subscriptionId}/cancel`,
            { reason_code: 'USER_REQUESTED', reason: reason || 'User requested cancellation' },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('[PayPal Subscription Cancelled]', subscriptionId);

        res.json({
            success: true,
            message: 'Subscription cancelled successfully'
        });
    } catch (error) {
        console.error('[PayPal Cancellation Error]', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to cancel subscription'
        });
    }
});

// Webhook endpoint for PayPal notifications
app.post('/api/paypal/webhook', (req, res) => {
    const { event_type, resource } = req.body;

    console.log('[PayPal Webhook]', event_type, resource?.id);

    // Log different subscription events
    switch (event_type) {
        case 'BILLING.SUBSCRIPTION.CREATED':
            console.log('✓ Subscription created:', resource.id);
            break;
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
            console.log('✓ Subscription activated:', resource.id);
            break;
        case 'BILLING.SUBSCRIPTION.UPDATED':
            console.log('✓ Subscription updated:', resource.id);
            break;
        case 'BILLING.SUBSCRIPTION.CANCELLED':
            console.log('✓ Subscription cancelled:', resource.id);
            break;
        case 'BILLING.SUBSCRIPTION.SUSPENDED':
            console.log('⚠ Subscription suspended:', resource.id);
            break;
        case 'BILLING.SUBSCRIPTION.EXPIRED':
            console.log('✓ Subscription expired:', resource.id);
            break;
        case 'PAYMENT.CAPTURE.COMPLETED':
            console.log('✓ Payment captured:', resource.id);
            break;
        case 'PAYMENT.CAPTURE.DENIED':
            console.log('✗ Payment denied:', resource.id);
            break;
    }

    // Always respond with 200 to acknowledge receipt
    res.status(200).json({ received: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`PayPal API: ${PAYPAL_API_URL}`);
    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
        console.warn('⚠ Warning: PayPal credentials not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_SECRET environment variables.');
    }
});
