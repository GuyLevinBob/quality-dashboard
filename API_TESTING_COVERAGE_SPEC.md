# Testing Coverage Analytics API Specification

## New Endpoint: `/api/testing-coverage`

### Purpose
Provide dedicated API endpoint for Testing Coverage Analytics that implements the exact JQL query requirements and returns properly filtered story data.

### Endpoint Details
- **URL**: `/api/testing-coverage`
- **Method**: `GET`
- **Query Parameters**: 
  - `_` (optional): Cache-busting timestamp

### JQL Query Implementation
The endpoint should execute this exact JIRA query:

```jql
type = Story
AND status NOT IN (Canceled, Reject, Rejected)
AND "leading team[dropdown]" IN ("MIS - GTM", "MIS - GTC", "MIS - CORP", "MIS - Platform")
AND "story points[number]" > "0.5"
ORDER BY created DESC
```

### Expected Results
- **Total Stories**: ~594 records
- **Teams**: MIS - GTM, MIS - GTC, MIS - CORP, MIS - Platform
- **Story Points**: Only stories with ≥0.5 points
- **Status**: Excludes Canceled, Cancelled, Reject, Rejected

### Data Transformation
The endpoint must transform the `testCaseCreated` field from JIRA's checkbox format:

**Input Formats:**
```javascript
// Array format (JIRA checkbox)
testCaseCreated: ["Yes"]  // → "Yes"
testCaseCreated: []       // → "No"

// Object format  
testCaseCreated: { value: ["Yes"] }  // → "Yes"
testCaseCreated: { value: [] }       // → "No"

// String format (already processed)
testCaseCreated: "Yes"    // → "Yes" (unchanged)
testCaseCreated: "No"     // → "No" (unchanged)

// Null/undefined
testCaseCreated: null     // → "No"
```

**Transformation Function:**
```javascript
function transformTestCaseField(testCaseCreated) {
  if (!testCaseCreated) return 'No';
  
  if (Array.isArray(testCaseCreated)) {
    return testCaseCreated.includes('Yes') ? 'Yes' : 'No';
  }
  
  if (typeof testCaseCreated === 'object' && testCaseCreated !== null) {
    const value = testCaseCreated.value || testCaseCreated;
    if (Array.isArray(value)) {
      return value.includes('Yes') ? 'Yes' : 'No';
    }
    return value === 'Yes' ? 'Yes' : 'No';
  }
  
  return testCaseCreated === 'Yes' ? 'Yes' : 'No';
}
```

### Response Format
```javascript
{
  "stories": [
    {
      "key": "BT-12345",
      "summary": "Story title",
      "status": "Done",
      "leadingTeam": "MIS - CORP", 
      "storyPoints": 1.0,
      "testCaseCreated": "Yes",  // Transformed field
      "sprint": "Sprint 26.1",
      "created": "2024-01-15T10:30:00Z",
      // ... other fields
    }
  ],
  "total": 594,
  "metadata": {
    "query": "Testing Coverage Analytics",
    "criteria": "Stories ≥0.5 points, valid teams, not cancelled/rejected", 
    "timestamp": "2024-01-15T15:45:30Z",
    "teams": ["MIS - GTM", "MIS - GTC", "MIS - CORP", "MIS - Platform"]
  }
}
```

### Integration Points
- Use existing JIRA connection and authentication
- Leverage existing issue fetching infrastructure
- Apply same caching strategy as other endpoints
- Include error handling for JIRA connectivity issues

### Fallback Behavior
If the endpoint is not available, the dashboard will:
1. Fall back to existing `storiesData` with manual filtering
2. Apply the same filtering logic client-side
3. Log warning about API unavailability

### Testing
The endpoint should return exactly the stories that match the JQL query. Test cases:
1. Verify story count matches JIRA query results (~594)
2. Confirm all returned stories have ≥0.5 story points
3. Validate team filtering (only the 4 specified teams)
4. Check status exclusions work correctly
5. Ensure `testCaseCreated` transformation is applied

### Performance
- Expected response time: <2 seconds
- Caching recommended for 5-10 minutes
- Support cache-busting with `_` parameter

---

## Implementation Notes

### Backend Changes Needed
1. Add new route handler for `/api/testing-coverage`
2. Implement JQL query execution
3. Add `testCaseCreated` field transformation
4. Include proper error handling and logging

### Frontend Integration
The dashboard has been updated to:
- Call the new endpoint on page load
- Fall back to manual filtering if endpoint unavailable  
- Use dedicated `testingCoverageData` array for coverage analytics
- Refresh coverage data on sync operations

This approach separates testing coverage data from general story browsing, ensuring the analytics always show the correct filtered dataset.