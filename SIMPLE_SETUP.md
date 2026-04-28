# 🚀 Simple 3-Step Setup Guide

I've created an **automated configuration script** that will do all the heavy lifting for you!

## Step 1: Update Your Credentials (2 minutes)

Open `auto-configure-jira.js` and update **only these 3 lines**:

```javascript
const JIRA_CONFIG = {
    baseUrl: 'https://hibob.atlassian.net',        // ← Your JIRA domain  
    username: 'your-email@hibob.com',              // ← Your email
    apiToken: 'your-api-token-here'                // ← Your API token
};
```

### Get Your API Token (if you don't have one):
1. Go to: https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **"Create API token"**
3. Name it: "Dashboard Testing Coverage"
4. Copy the token and paste it in the script

## Step 2: Run Auto-Configuration (30 seconds)

```bash
# Install dependencies (if needed)
npm install node-fetch

# Run the auto-configuration
node auto-configure-jira.js
```

**The script will automatically:**
- ✅ Connect to your JIRA
- ✅ Find all custom field IDs  
- ✅ Discover the correct field mappings
- ✅ Test the configuration
- ✅ Generate ready-to-use backend code
- ✅ Show you exactly how many stories it found (~594 expected!)

## Step 3: Integrate the Generated Backend (2 minutes)

The script generates `configured-backend-testing-coverage.js` - just add it to your server:

```javascript
// In your main server file (server.js, app.js, etc.):
const { setupTestingCoverageRoutes } = require('./configured-backend-testing-coverage');

// Add this one line after your existing routes:
setupTestingCoverageRoutes(app);
```

Then restart your server and refresh the dashboard!

## Expected Results

**Before**: 5 of 34 stories (15% coverage) ❌  
**After**: X of ~594 stories (accurate coverage) ✅

---

## That's it! 🎉

The auto-configuration script handles:
- Field ID discovery
- JQL query testing  
- Code generation
- Integration instructions
- Error handling

**Just update the 3 credentials and run the script!**

---

## If You Need Help

The script will tell you exactly:
- ✅ How many stories it found (should be ~594)
- ✅ Which field mappings it discovered  
- ✅ Whether the configuration is working
- ❌ What to fix if something goes wrong

**Total time needed: ~5 minutes**