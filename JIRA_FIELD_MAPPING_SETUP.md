# JIRA Field Mapping Setup Guide

## Overview
The testing coverage backend needs to map JIRA custom fields to the correct field IDs in your JIRA instance. Each JIRA instance has different custom field IDs.

## Required Custom Fields

The backend needs access to these fields:

| Field Name | Purpose | Example Values |
|------------|---------|----------------|
| **Story Points** | Filter stories ≥0.5 points | `1`, `2`, `3`, `5`, `8` |
| **Leading Team** | Filter by MIS teams | `"MIS - GTM"`, `"MIS - GTC"`, `"MIS - CORP"`, `"MIS - Platform"` |
| **Test Case Created** | Track testing coverage | `["Yes"]`, `[]`, `"No"` |
| **Sprint** | Group by sprint (optional) | `"Sprint 26.1"`, `"Sprint 26.2"` |

## Finding Your JIRA Custom Field IDs

### Method 1: JIRA REST API Explorer
1. Go to: `https://your-domain.atlassian.net/rest/api/3/issue/[ISSUE-KEY]`
2. Replace `[ISSUE-KEY]` with any story key (e.g., `BT-12345`)
3. Look for custom fields in the response:

```json
{
  "fields": {
    "customfield_10020": 3,                    // Story Points
    "customfield_10021": {"value": "MIS - GTM"}, // Leading Team  
    "customfield_10022": ["Yes"],              // Test Case Created
    "customfield_10023": [{"name": "Sprint 26.1"}] // Sprint
  }
}
```

### Method 2: JIRA Issue View Source
1. Open any story in JIRA
2. Right-click → "View Page Source"
3. Search for field names like "Story Points" to find the associated `customfield_` ID

### Method 3: JIRA Administration (Admin Access Required)
1. Go to **JIRA Settings** → **Issues** → **Custom Fields**
2. Find each field and note the ID in the URL or field configuration

## Configuration Update

Update the field mappings in `backend-testing-coverage.js`:

```javascript
// In the transformJiraIssue function, update these field IDs:
function transformJiraIssue(jiraIssue) {
    const fields = jiraIssue.fields;
    
    // UPDATE THESE FIELD IDs BASED ON YOUR JIRA INSTANCE:
    const storyPoints = fields.customfield_XXXXX || 0;           // Story Points
    const leadingTeam = fields.customfield_YYYYY?.value || null; // Leading Team
    const testCaseCreated = fields.customfield_ZZZZZ;           // Test Case Created
    const sprint = fields.customfield_WWWWW?.[0]?.name || null; // Sprint
    
    // Rest of the transformation...
}
```

## Field Value Formats

### Story Points
- **Type**: Number
- **Expected**: `3`, `5`, `8` (numeric values)
- **Filtering**: Must be ≥ 0.5

### Leading Team
- **Type**: Single Select Dropdown
- **Expected Values**: 
  - `"MIS - GTM"`
  - `"MIS - GTC"` 
  - `"MIS - CORP"`
  - `"MIS - Platform"`
- **API Format**: `{"value": "MIS - GTM"}` or `"MIS - GTM"`

### Test Case Created  
- **Type**: Checkbox
- **Expected Values**:
  - `["Yes"]` (checked)
  - `[]` (unchecked)
  - `null` (not set)
- **Transformation**: `["Yes"] → "Yes"`, `[] → "No"`, `null → "No"`

### Sprint
- **Type**: Sprint field (Agile)
- **API Format**: `[{"id": 123, "name": "Sprint 26.1"}]`
- **Extraction**: Take the `name` from first sprint

## Testing Field Mappings

### 1. Test Single Issue API Call
```bash
curl -X POST \
  "https://your-domain.atlassian.net/rest/api/3/search" \
  -H "Authorization: Basic [base64-encoded-credentials]" \
  -H "Content-Type: application/json" \
  -d '{
    "jql": "key = BT-12345",
    "fields": ["customfield_10020", "customfield_10021", "customfield_10022", "customfield_10023"]
  }'
```

### 2. Verify Field Values
Check that the response contains expected field structures:
```json
{
  "issues": [{
    "fields": {
      "customfield_10020": 3,                           // Story Points ✓
      "customfield_10021": {"value": "MIS - GTM"},      // Leading Team ✓  
      "customfield_10022": ["Yes"],                     // Test Case Created ✓
      "customfield_10023": [{"name": "Sprint 26.1"}]   // Sprint ✓
    }
  }]
}
```

## Environment Variables

Set these environment variables for your JIRA connection:

```bash
# .env file
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_USERNAME=your-email@company.com  
JIRA_API_TOKEN=your-api-token
```

### Creating JIRA API Token
1. Go to: https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **"Create API Token"**
3. Give it a name like "Dashboard Testing Coverage"
4. Copy the generated token

## Common Issues & Solutions

### Issue: Empty Results
**Cause**: Wrong custom field IDs
**Solution**: Double-check field mapping using Method 1 above

### Issue: "Field does not exist" Error
**Cause**: Field ID doesn't exist in your JIRA instance
**Solution**: Verify the field exists and get correct ID

### Issue: Wrong Field Values
**Cause**: Field type mismatch (e.g., expecting dropdown but getting text)
**Solution**: Check field configuration in JIRA admin

### Issue: Authentication Errors
**Cause**: Wrong credentials or insufficient permissions
**Solution**: 
- Verify API token is correct
- Ensure user has permission to read issues and custom fields
- Test with basic JIRA REST API call first

## Validation Checklist

- [ ] Found correct custom field IDs for all 4 required fields
- [ ] Updated field mappings in `backend-testing-coverage.js`
- [ ] Set JIRA environment variables
- [ ] Tested API connection with curl or similar tool
- [ ] Verified field value formats match expectations
- [ ] Confirmed user permissions allow field access

## Next Steps

After completing field mapping:
1. **Deploy the backend code** to your server
2. **Restart your Express server** to load new routes
3. **Test the endpoint**: `GET http://localhost:3002/api/testing-coverage`
4. **Verify dashboard integration** - should show ~594 stories instead of 34
5. **Test sync integration** - coverage data should refresh when main sync runs

---

## Quick Reference

| Component | Location | Purpose |
|-----------|----------|---------|
| **Backend Implementation** | `backend-testing-coverage.js` | Full API endpoint code |
| **Field Mapping Setup** | This file | Configure JIRA field IDs |  
| **Frontend Integration** | `dashboard-multi-issue.html` | Already updated to call new API |
| **API Specification** | `API_TESTING_COVERAGE_SPEC.md` | Technical requirements |

The frontend is already configured to call the new endpoint and fall back gracefully if it's not available!