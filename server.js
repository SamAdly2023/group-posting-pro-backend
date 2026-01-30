require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// PayPal Configuration
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || '';
const PAYPAL_API_URL = process.env.NODE_ENV === 'production'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com';

const GHL_WEBHOOK_URL = 'https://services.leadconnectorhq.com/hooks/tbWaBmRj1ai6VJlNz3VY/webhook-trigger/DSFHrUO71Lptpvh4qKMW';

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Send Data to GoHighLevel Workflow
async function sendToGHL(eventType, data) {
    try {
        const payload = {
            event_type: eventType,
            timestamp: new Date().toISOString(),
            ...data
        };
        console.log(`[GHL Webhook] Sending ${eventType}...`);
        await axios.post(GHL_WEBHOOK_URL, payload);
        console.log(`[GHL Webhook] Sent ${eventType} successfully.`);
    } catch (error) {
        console.error(`[GHL Webhook Error] Failed to send ${eventType}:`, error.message);
    }
}

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
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// --- Contact Form Endpoint ---
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;

        // Trigger GHL Workflow
        await sendToGHL('CONTACT_FORM_SUBMISSION', {
            contact_name: name,
            contact_email: email,
            message: message,
            source: 'landing_page'
        });

        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('[Contact Form Error]', error);
        res.status(500).json({ success: false, error: 'Failed to send message' });
    }
});

// --- API Key & AI Proxy ---

// Mimics: https://groupposting.com/wp-json/groupposting/v1/get-api-key
app.post('/api/get-api-key', (req, res) => {
    console.log('[API Key Request]', req.body);
    // Since we are proxying AI requests through this server, we don't need to send the real key to the client.
    // We send a placeholder so the extension's check passes.
    res.json({
        success: true,
        api_key: "proxy-mode-enabled",
        expires: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365) // 1 year
    });
});

// AI Proxy Endpoint (Uses Server-Side Gemini Key)
app.post('/api/ai/chat/completions', async (req, res) => {
    try {
        console.log('[AI Proxy] Request received');

        // Get the key from Render environment variables
        // User stated they added "API_KEY" or "DEEPSEEK_API_KEY"
        const SERVER_API_KEY = process.env.API_KEY || process.env.DEEPSEEK_API_KEY;

        if (!SERVER_API_KEY) {
            console.error('[AI Proxy] Missing API_KEY in server environment');
            return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
        }

        // Forward to Gemini via OpenAI compatibility layer
        // https://ai.google.dev/gemini-api/docs/openai
        const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

        // Override the model to use a Gemini model
        // The extension sends 'deepseek-chat', we swap it for 'gemini-1.5-flash' (fast & cheap)
        const requestBody = {
            ...req.body,
            model: "gemini-1.5-flash"
        };

        const response = await axios.post(GEMINI_URL, requestBody, {
            headers: {
                'Authorization': `Bearer ${SERVER_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        res.json(response.data);

    } catch (error) {
        console.error('[AI Proxy Error]', error.message);
        if (error.response) {
            console.error('[AI Proxy Error Data]', error.response.data);
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: 'Failed to communicate with AI provider' });
        }
    }
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
app.post('/api/paypal/webhook', async (req, res) => {
    const { event_type, resource } = req.body;

    console.log('[PayPal Webhook]', event_type, resource?.id);

    // Extract common user data if available
    const userData = {
        subscription_id: resource?.id,
        plan_id: resource?.plan_id,
        status: resource?.status,
        email: resource?.subscriber?.email_address,
        name: resource?.subscriber?.name?.given_name + ' ' + resource?.subscriber?.name?.surname
    };

    // Log different subscription events
    switch (event_type) {
        case 'BILLING.SUBSCRIPTION.CREATED':
            console.log('✓ Subscription created:', resource.id);
            await sendToGHL('SUBSCRIPTION_CREATED', userData);
            break;
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
            console.log('✓ Subscription activated:', resource.id);
            // This is where you'd send the License Key email
            await sendToGHL('SUBSCRIPTION_ACTIVATED', {
                ...userData,
                action: 'SEND_LICENSE_KEY' // Signal to GHL to send the license email
            });
            break;
        case 'BILLING.SUBSCRIPTION.UPDATED':
            console.log('✓ Subscription updated:', resource.id);
            await sendToGHL('SUBSCRIPTION_UPDATED', userData);
            break;
        case 'BILLING.SUBSCRIPTION.CANCELLED':
            console.log('✓ Subscription cancelled:', resource.id);
            await sendToGHL('SUBSCRIPTION_CANCELLED', userData);
            break;
        case 'BILLING.SUBSCRIPTION.SUSPENDED':
            console.log('⚠ Subscription suspended:', resource.id);
            await sendToGHL('SUBSCRIPTION_SUSPENDED', userData);
            break;
        case 'BILLING.SUBSCRIPTION.EXPIRED':
            console.log('✓ Subscription expired:', resource.id);
            await sendToGHL('SUBSCRIPTION_EXPIRED', userData);
            break;
        case 'PAYMENT.CAPTURE.COMPLETED':
            console.log('✓ Payment captured:', resource.id);
            // Optional: Send "Payment Receipt" email
            await sendToGHL('PAYMENT_SUCCESSFUL', {
                amount: resource?.amount?.value,
                currency: resource?.amount?.currency_code,
                ...userData
            });
            break;
        case 'PAYMENT.CAPTURE.DENIED':
            console.log('✗ Payment denied:', resource.id);
            await sendToGHL('PAYMENT_FAILED', userData);
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
