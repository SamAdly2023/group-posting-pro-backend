# Group Posting Pro Backend Server

Created by **Sam Adly**

## Description

This is the backend server for the Group Posting Pro extension. It handles API requests for license verification, API key management, and **PayPal subscription payments**.

---

## 🚀 Complete Deployment Guide: Render.com + PayPal Subscriptions

### **PHASE 1: PayPal Setup (10 minutes)**

#### Step 1.1: Get PayPal Credentials
1. Go to [PayPal Developer Dashboard](https://developer.paypal.com)
2. Sign in with your PayPal account (or create one)
3. Click **"Apps & Credentials"** tab
4. Make sure you're in **Sandbox** mode (for testing) or **Live** mode (for production)
5. Under "REST API signature", find your **Client ID** and **Secret**
6. **Save these credentials** - you'll need them for Render.com

Your credentials:
```
Client ID: AarwkYK4lzBjwzF7OCgJeoRBnGAZehBAsNrEyrQZSdzu7yyPH3P7qEm0qtm-VNj_SvYFPpKA9PjZqO2G
Secret: EIrQs5idryj4M61B1A2sA2EUAEasToLqgB7GiEAULjEhh6Ncj35X75v6DgpIgieisDuiXkHXqs_1oWyF
```

#### Step 1.2: Create a Billing Plan (Optional but Recommended)
1. In PayPal Developer, go to **Products** → **Subscriptions**
2. Click **Create Plan**
3. Set details:
   - **Plan Name**: "Premium Group Poster"
   - **Description**: "Monthly subscription for extended features"
   - **Billing Cycle**: Monthly (or your preferred frequency)
   - **Price**: $9.99 (or your price)
4. Save the **Plan ID** - you'll use this when creating subscriptions

---

### **PHASE 2: GitHub Repository Setup (5 minutes)**

#### Step 2.1: Initialize Git
```bash
cd backend_server
git init
git add .
git commit -m "Initial commit - Group Posting Pro Backend with PayPal integration"
```

#### Step 2.2: Create GitHub Repository
1. Go to [GitHub.com](https://github.com) and sign in
2. Click **"+"** → **"New repository"**
3. Name it: `group-posting-pro-backend`
4. Set to **Public** (Render needs access)
5. Click **"Create repository"**

#### Step 2.3: Push Code to GitHub
```bash
git remote add origin https://github.com/YOUR_USERNAME/group-posting-pro-backend.git
git branch -M main
git push -u origin main
```

---

### **PHASE 3: Render.com Deployment (10 minutes)**

#### Step 3.1: Sign Up on Render.com
1. Go to [render.com](https://render.com)
2. Click **"Sign up"**
3. Use your GitHub account to sign in (easier for deployment)
4. Authorize Render to access your GitHub

#### Step 3.2: Create Web Service
1. In Render dashboard, click **"New +"** → **"Web Service"**
2. Select your **group-posting-pro-backend** repository
3. Click **"Connect"**

#### Step 3.3: Configure Service
- **Name**: `group-posting-pro-backend` (Render will create a unique URL)
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Select **Free** (or Paid for better performance)

#### Step 3.4: Add Environment Variables
Click **"Advanced"** and add these variables:

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Required |
| `PAYPAL_CLIENT_ID` | Your Client ID from Step 1.1 | Keep SECRET |
| `PAYPAL_SECRET` | Your Secret from Step 1.1 | Keep SECRET |
| `PORT` | 3000 | Render sets this, but good to be explicit |

**⚠️ IMPORTANT**: Do NOT commit these secrets to GitHub. Only add them in Render's environment variables dashboard.

#### Step 3.5: Deploy
1. Click **"Create Web Service"**
2. Render will automatically build and deploy
3. Wait for the green checkmark ✓ (usually 2-3 minutes)
4. Your API URL will be: `https://group-posting-pro-backend.onrender.com`

#### Step 3.6: Test Deployment
Open your browser and visit:
```
https://group-posting-pro-backend.onrender.com
```

You should see:
```json
{
  "status": "running",
  "message": "Group Posting Pro Backend Server by Sam Adly",
  "timestamp": "2024-01-30T..."
}
```

---

### **PHASE 4: PayPal Webhook Setup (5 minutes)**

#### Step 4.1: Register Webhook
1. Go to [PayPal Developer Webhooks](https://developer.paypal.com/developer/webhooks)
2. Click **"Create Webhook"**
3. Enter your **Webhook URL**:
   ```
   https://group-posting-pro-backend.onrender.com/api/paypal/webhook
   ```
4. Select these event types:
   - ✓ BILLING.SUBSCRIPTION.CREATED
   - ✓ BILLING.SUBSCRIPTION.ACTIVATED
   - ✓ BILLING.SUBSCRIPTION.CANCELLED
   - ✓ PAYMENT.CAPTURE.COMPLETED
   - ✓ PAYMENT.CAPTURE.DENIED

5. Click **"Create Webhook"**
6. Save your **Webhook ID** (optional, for monitoring)

#### Step 4.2: Test Webhook
Your server will now log all PayPal events. Check Render logs to verify:
1. In Render dashboard, select your service
2. Click **"Logs"** tab
3. You'll see PayPal webhook events when subscriptions are created/updated

---

### **PHASE 5: Update Extension (10 minutes)**

Update your extension to use the new backend URL and PayPal endpoints.

#### Step 5.1: Update API Base URL
In your extension's `background.js` or main API file, change:

```javascript
// OLD
const API_BASE_URL = 'http://localhost:3000';

// NEW
const API_BASE_URL = 'https://group-posting-pro-backend.onrender.com';
```

#### Step 5.2: Implement PayPal Subscription in UI
Add buttons/functionality to your extension popup to:

**Create Subscription:**
```javascript
async function createSubscription(planId, email, name) {
    const response = await fetch(`${API_BASE_URL}/api/paypal/create-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            planId: planId,  // e.g., "P-1234567890"
            subscriberEmail: email,
            subscriberName: name
        })
    });
    
    const data = await response.json();
    if (data.success) {
        // Redirect user to PayPal approval
        window.open(data.approvalLink, '_blank');
    }
}
```

**Validate Subscription:**
```javascript
async function validateSubscription(subscriptionId) {
    const response = await fetch(`${API_BASE_URL}/api/paypal/validate-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId: subscriptionId })
    });
    
    const data = await response.json();
    if (data.success) {
        console.log('Status:', data.subscription.status);
        // Update UI based on subscription status
    }
}
```

**Cancel Subscription:**
```javascript
async function cancelSubscription(subscriptionId) {
    const response = await fetch(`${API_BASE_URL}/api/paypal/cancel-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            subscriptionId: subscriptionId,
            reason: 'User requested cancellation'
        })
    });
    
    const data = await response.json();
    return data.success;
}
```

---

## 📊 API Endpoints

### Health & Status
- `GET /` - Server info
- `GET /health` - Health status

### API Keys
- `POST /api/get-api-key` - Get API key for AI features

### License Verification
- `POST /api/lemonsqueezy/activate` - Activate LemonSqueezy license
- `POST /api/lemonsqueezy/validate` - Validate LemonSqueezy license
- `POST /api/gumroad/verify` - Verify Gumroad license

### PayPal Subscriptions
- `POST /api/paypal/create-subscription` - Create new subscription
  - Body: `{ planId, subscriberEmail, subscriberName }`
- `POST /api/paypal/validate-subscription` - Get subscription details
  - Body: `{ subscriptionId }`
- `POST /api/paypal/cancel-subscription` - Cancel subscription
  - Body: `{ subscriptionId, reason }`
- `POST /api/paypal/webhook` - PayPal webhook (auto-handled)

---

## 💻 Local Development

### Setup
```bash
cd backend_server
npm install
```

### Create .env file
Copy from `.env.example` and add your PayPal credentials:
```bash
cp .env.example .env
# Edit .env with your credentials
```

### Run Server
```bash
npm start
```

Server runs at `http://localhost:3000`

### Test PayPal Endpoints
```bash
# Create subscription
curl -X POST http://localhost:3000/api/paypal/create-subscription \
  -H "Content-Type: application/json" \
  -d '{"planId":"P-123","subscriberEmail":"user@example.com","subscriberName":"John"}'
```

---

## 🔐 Security Best Practices

1. **Never commit secrets** - Use environment variables only
2. **Use Sandbox mode** for testing (disable in production)
3. **Validate all webhook requests** from PayPal
4. **Use HTTPS only** - Render provides free SSL
5. **Monitor logs** regularly in Render dashboard
6. **Rotate credentials** periodically in PayPal Developer

---

## ⚠️ Important Notes

- **Free tier on Render**: May spin down after 15 min of inactivity (first request takes 30-60 sec)
- **PayPal Sandbox vs Live**: Sandbox for testing, Live for real payments
- **Webhook timeout**: Ensure webhook responses within 5 seconds
- **Subscription status**: Check webhook logs to track subscription lifecycle

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Invalid credentials" | Check PAYPAL_CLIENT_ID and PAYPAL_SECRET in Render env vars |
| Webhook not receiving | Verify webhook URL in PayPal Developer, check Render logs |
| Subscription fails | Ensure PayPal plan exists and plan ID is correct |
| 502 Bad Gateway | Render may be spinning up, wait 1-2 minutes and retry |

---

## 📞 Support

Created and maintained by Sam Adly

For issues, check:
1. Render logs: `https://dashboard.render.com`
2. PayPal logs: `https://developer.paypal.com`
3. Browser console for API errors
