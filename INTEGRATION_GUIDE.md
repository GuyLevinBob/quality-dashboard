# Testing Coverage Backend Integration Guide

## Quick Integration Steps

### 1. Add the Backend Code

Copy `backend-testing-coverage.js` to your server project and integrate it:

```javascript
// In your main Express app file (e.g., server.js, app.js)
const express = require('express');
const { setupTestingCoverageRoutes, syncTestingCoverageData } = require('./backend-testing-coverage');

const app = express();

// Your existing middleware...
app.use(express.json());
app.use(cors()); // if you're using CORS

// Your existing routes...

// ADD THIS: Setup testing coverage routes
setupTestingCoverageRoutes(app);

// MODIFY THIS: Enhance your existing sync endpoint
app.post('/api/sync-issues', async (req, res) => {
    try {
        console.log('🔄 Starting enhanced sync...');
        
        // 1. Your existing sync logic
        // await your existing sync process here...
        
        // 2. NEW: Also sync testing coverage data
        await syncTestingCoverageData();
        
        res.json({
            success: true,
            message: 'Sync completed (including testing coverage)',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Sync failed:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(3002, () => {
    console.log('✅ Server running with testing coverage support on port 3002');
});
```

### 2. Configure JIRA Field Mappings

**CRITICAL**: Update the custom field IDs in `backend-testing-coverage.js`:

```javascript
// Find this function and update the field IDs:
function transformJiraIssue(jiraIssue) {
    const fields = jiraIssue.fields;
    
    // UPDATE THESE FIELD IDS FOR YOUR JIRA INSTANCE:
    const storyPoints = fields.customfield_10020 || 0;        // ← Change this ID
    const leadingTeam = fields.customfield_10021?.value || null; // ← Change this ID  
    const testCaseCreated = fields.customfield_10022;         // ← Change this ID
    const sprint = fields.customfield_10023?.[0]?.name || null; // ← Change this ID
    
    // ... rest of function
}
```

Use the `JIRA_FIELD_MAPPING_SETUP.md` guide to find your correct field IDs.

### 3. Set Environment Variables

Create/update your `.env` file:

```bash
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_USERNAME=your-email@company.com
JIRA_API_TOKEN=your-generated-api-token
```

### 4. Install Dependencies (if needed)

```bash
npm install node-fetch  # or your preferred HTTP client
```

### 5. Test the Integration

**Start your server:**
```bash
node server.js  # or whatever your start command is
```

**Test the new endpoint:**
```bash
curl http://localhost:3002/api/testing-coverage
```

**Expected response:**
```json
{
  "stories": [...],
  "total": 594,  // Should be much higher than 34!
  "metadata": {
    "query": "Testing Coverage Analytics",
    "timestamp": "2024-01-15T15:45:30Z",
    "teams": ["MIS - GTM", "MIS - GTC", "MIS - CORP", "MIS - Platform"]
  }
}
```

### 6. Verify Dashboard Integration

**Refresh the dashboard** and you should see:
- ✅ **~594 stories** instead of 34
- ✅ **All 4 teams** represented  
- ✅ **Accurate coverage percentages**
- ✅ **No more 404 errors** in console

## New API Endpoints Added

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/testing-coverage` | GET | Get testing coverage stories |
| `/api/testing-coverage/refresh` | POST | Force refresh cache |
| `/api/testing-coverage/status` | GET | Check cache status |

## Testing Commands

```javascript
// In browser console on dashboard:
refreshTestingCoverage()     // Should now work without 404
debugTestingCoverage()       // Should show ~594 stories
analyzeDataSources()         // Should show API working
```

## Troubleshooting

### Still Getting 404?
- Check that you've added the routes: `setupTestingCoverageRoutes(app)`
- Verify server is running on port 3002
- Check for typos in endpoint path

### Still Getting 34 Stories?
- Check JIRA field mappings are correct
- Verify JIRA credentials in environment variables
- Look at server logs for JIRA API errors
- Test JIRA connection manually

### JIRA Authentication Errors?
- Verify API token is correct and not expired
- Check username/email is correct
- Ensure user has permissions to read custom fields
- Test with basic JIRA REST API call

### Slow Performance?
- Caching is enabled (10 minute default)
- Adjust cache TTL in code if needed
- Consider pagination limits for very large datasets

## Monitoring

Add logging to see what's happening:

```javascript
// Server logs will show:
console.log('🔍 Executing JQL query: ...');
console.log('✅ Retrieved 594 stories total');
console.log('💾 Cached 594 testing coverage stories');
```

## Success Indicators

✅ **Server starts without errors**  
✅ **New endpoints respond (not 404)**  
✅ **JIRA API calls succeed**  
✅ **Dashboard shows ~594 stories**  
✅ **All 4 teams visible in coverage**  
✅ **Sync operation includes testing coverage**

---

## Files Reference

- `backend-testing-coverage.js` - Complete backend implementation
- `JIRA_FIELD_MAPPING_SETUP.md` - Configure JIRA field IDs  
- `API_TESTING_COVERAGE_SPEC.md` - Technical specification
- `dashboard-multi-issue.html` - Frontend (already updated)

The dashboard is ready to work with the new API once the backend is deployed!