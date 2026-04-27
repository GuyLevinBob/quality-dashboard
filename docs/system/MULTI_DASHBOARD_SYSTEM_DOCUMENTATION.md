# Multi-Dashboard System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Data Sources & Caching](#data-sources--caching)
4. [Field Extraction Logic](#field-extraction-logic)
5. [Filtering System](#filtering-system)
6. [API Endpoints](#api-endpoints)
7. [Dashboard Features](#dashboard-features)
8. [Recent Fixes (April 2026)](#recent-fixes-april-2026)
9. [Troubleshooting](#troubleshooting)
10. [Future Development](#future-development)

---

## System Overview

The Multi-Dashboard System is a comprehensive analytics platform for JIRA issues (Bugs, Stories, Test Cases) with real-time synchronization, advanced filtering, and interactive visualizations.

### Key Components:
- **JIRA API Integration** (`jira-bugs.js`, `jira-field-mappings.js`)
- **API Server** (`bug-api-server.js`) - Node.js backend with caching
- **Multi-Issue Dashboard** (`dashboard-multi-issue.html`) - Main analytics interface
- **Data Cache Files** (`issues-cache.json`, `bugs-cache.json`)

### Supported Issue Types:
- **Bugs** (Production bugs with severity/regression tracking)
- **Stories** (User stories with test case creation tracking)
- **Test Cases** (Automated test cases with AI generation tracking)

---

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   JIRA API      │────│   API Server     │────│   Dashboard         │
│                 │    │  (Port 3002)     │    │  (Port 8090)        │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   Cache Files    │
                       │ issues-cache.json│
                       │  bugs-cache.json │
                       └──────────────────┘
```

### Data Flow:
1. **JIRA Sync** → Fetch issues via JIRA REST API
2. **Field Extraction** → Process custom fields using mapping logic
3. **Cache Storage** → Store processed data in JSON files
4. **API Serving** → Serve lightweight data to dashboard
5. **Dashboard Rendering** → Interactive charts and filtering

---

## Data Sources & Caching

### Primary Cache Files:

#### `issues-cache.json`
- **Purpose**: Multi-issue type storage (Stories, Test Cases, Bugs)
- **Structure**:
  ```json
  {
    "issues": [...],
    "metadata": {
      "totalIssues": 6078,
      "issueTypes": ["Bug", "Story", "Test"],
      "jiraInstance": "hibob.atlassian.net"
    },
    "lastSync": "2026-04-26T14:33:15.604Z"
  }
  ```

#### `bugs-cache.json`
- **Purpose**: Legacy bug-specific storage
- **Usage**: Maintains compatibility with existing bug endpoints

### Cache Management:
- **Automatic Backups**: Created before each sync (`issues-cache-backup-{timestamp}.json`)
- **Sync Frequency**: On-demand via API calls
- **Data Validation**: Field extraction with error handling
- **Performance**: ~6,078 issues processed in ~68 seconds

---

## Field Extraction Logic

Located in `jira-field-mappings.js` - maps JIRA custom fields to dashboard fields.

### Key Field Mappings:
```javascript
const JIRA_FIELD_MAPPINGS = {
    LEADING_TEAM: 'customfield_10574',        // Dropdown: Team assignment
    SYSTEM: 'customfield_10107',              // Dropdown: System/Component
    SPRINT: 'customfield_10020',              // Array: Sprint assignments
    REGRESSION: 'customfield_10617',          // Dropdown: Yes/No regression
    SEVERITY: 'customfield_10616',            // Dropdown: Critical/High/Medium/Low
    TEST_CASE_CREATED: 'customfield_11391',   // Checkbox: Yes/No array
    AI_GENERATED_TEST_CASES: 'customfield_11392' // URL: AI test generation link
};
```

### Critical Extraction Functions:

#### Sprint Logic (FIXED April 2026)
```javascript
getSprintName: (sprintField) => {
    // Returns EARLIEST sprint by startDate (unified for all issue types)
    if (!sprintField || !Array.isArray(sprintField)) return null;
    
    const sortedSprints = sprintField
        .filter(sprint => sprint && sprint.startDate)
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    
    return sortedSprints.length > 0 ? sortedSprints[0].name : null;
}
```

#### Test Case Created Logic (FIXED April 2026)
```javascript
getTestCaseCreated: (fieldData) => {
    // Handles JIRA checkbox array format: [{value: "Yes", id: "11440"}]
    if (!fieldData) return 'No';
    
    if (Array.isArray(fieldData)) {
        // Check each item for "Yes" value
        for (const item of fieldData) {
            if (typeof item === 'string' && item === 'Yes') return 'Yes';
            if (typeof item === 'object' && item?.value === 'Yes') return 'Yes';
        }
        return 'No';
    }
    
    // Handle object/string formats
    if (typeof fieldData === 'object' && fieldData?.value === 'Yes') return 'Yes';
    if (typeof fieldData === 'string' && fieldData === 'Yes') return 'Yes';
    
    return 'No';
}
```

---

## Filtering System

### Dashboard Filters (Multi-select with AND logic):

#### Universal Filters (All Issue Types):
- **Status**: Not Started, In Progress, Done, UAT, etc.
- **Severity**: Critical, High, Medium, Low, No Data
- **Assignee**: User display names
- **Leading Team**: MIS - CORP, MIS - GTC, MIS - Platform, etc.
- **System**: SFDC, Netsuite, Bamboo, etc.
- **Sprint**: Sprint names (earliest sprint per issue)

#### Issue Type Specific Filters:

**Bug-Only Filters**:
- **Regression**: Yes/No (hidden when Bugs not selected)

**Story-Only Filters**:
- **Test Case Created**: Yes/No (hidden when Stories not selected)

**Test Case-Only Filters**:
- **AI Generated**: Yes/No/No Data (hidden when Test Cases not selected)

### Filter Behavior:
- **Dynamic Visibility**: Filters show/hide based on selected issue types
- **Auto-Clear**: Filters are cleared when their issue type is deselected
- **Search Integration**: Text search across summary, key, and assignee fields
- **Date Range**: Filter by creation date range

### Filter Implementation (dashboard-multi-issue.html):
```javascript
// Example: Test Case Created filter (Stories only)
function applyFilters() {
    const selectedTypes = getSelectedIssueTypes();
    
    return allData.filter(item => {
        // Universal filters
        const statusMatch = filterSelections.status.size === 0 || 
                          filterSelections.status.has(item.status);
        
        // Story-specific filter
        let testCaseCreatedMatch = true;
        if (item.issueType === 'Story') {
            testCaseCreatedMatch = filterSelections.testCaseCreated.size === 0 || 
                                 filterSelections.testCaseCreated.has(item.testCaseCreated);
        }
        
        return statusMatch && testCaseCreatedMatch /* ... other filters */;
    });
}
```

---

## API Endpoints

### Core Endpoints:

#### `GET /api/issues-lite`
- **Purpose**: Lightweight issue data for dashboard
- **Parameters**: `?types=Bug,Story,Test`
- **Response**: Processed issues with dashboard-compatible format
- **Caching**: Serves from `issues-cache.json`

#### `POST /api/sync-issues`
- **Purpose**: Full multi-issue type sync from JIRA
- **Body**: `{"issueTypes": ["Bug", "Story", "Test"]}`
- **Process**: Fetch → Extract → Cache → Respond
- **Duration**: ~60-80 seconds for 6,078 issues

#### `POST /api/sync` (Legacy)
- **Purpose**: Bug-only synchronization
- **Compatibility**: Maintains existing bug workflows

#### `GET /api/issues/:id/details`
- **Purpose**: Heavy issue details with changelog
- **Usage**: Drill-down analysis for specific issues

### API Response Format:
```javascript
{
    "issues": [
        {
            "key": "BT-12421",
            "issueType": "Story",
            "summary": "Enable Deal Desk users...",
            "status": "Done",
            "testCaseCreated": "Yes",
            "sprint": "PI2.26.Sprint 2 (9/3 - 30/3)",
            // ... other fields
        }
    ],
    "metadata": {
        "totalIssues": 6078,
        "lastSync": "2026-04-26T14:33:15.604Z"
    }
}
```

---

## Dashboard Features

### Main Dashboard (`dashboard-multi-issue.html`)

#### Chart Types:
1. **Issue Type Distribution** (Pie Chart)
2. **Status Distribution** (Stacked Bar Chart)
3. **Severity Analysis** (Horizontal Bar Chart)
4. **Sprint Analysis** (Timeline Chart)
5. **Test Case Created Analysis** (Stories only)
6. **AI Generated Analysis** (Test Cases only)

#### Interactive Features:
- **Dynamic Filtering**: Real-time filter application
- **Chart Drilling**: Click charts to filter data
- **Export Functionality**: CSV/JSON data export
- **Live Statistics**: Auto-updating counters
- **Responsive Design**: Mobile-friendly interface

#### Quality Analysis Section:
- **Field Coverage**: Shows data completeness per field
- **Missing Data Detection**: Highlights null/empty fields
- **Data Quality Metrics**: Completeness percentages
- **Chart Zoom Functionality**: Interactive zoom and horizontal scrolling for detailed chart analysis

##### Chart Zoom Feature (Added April 2026):
**Purpose**: Enhanced chart navigation for detailed analysis of Quality Analysis data

**Features**:
- **Zoom Controls**: 
  - **Zoom In** (`+`): Increase chart magnification up to 1000%
  - **Zoom Out** (`-`): Decrease chart magnification down to 10%
  - **Reset** (`⌂`): Return to default 100% view
  - **Zoom Indicator**: Live percentage display (e.g., "150%")

- **Horizontal Navigation**:
  - **Seamless Scrollbar**: Appears automatically when zoomed beyond container width
  - **Data Coverage**: Navigate through all data points when zoomed
  - **Position Preservation**: Maintains scroll position during zoom level changes
  - **Smooth Transitions**: No jarring jumps when adjusting zoom levels

**Technical Implementation**:
- **Canvas Resizing**: Dynamic width calculation based on zoom level and data point count
- **Non-Responsive Mode**: Chart.js configured for manual dimension control
- **Scroll Synchronization**: Preserves relative scroll position during chart recreation
- **State Management**: Zoom level tracking in `chartBuilderState.zoomState`

**User Interface**:
```html
<!-- Zoom Controls (appears when chart is active) -->
<div class="zoom-indicator" id="zoom-indicator">
    <button class="zoom-out-btn" title="Zoom out">—</button>
    <span class="zoom-percentage">100%</span>
    <button class="zoom-in-btn" title="Zoom in">+</button>
    <button class="zoom-reset-btn" title="Reset zoom">⌂</button>
</div>
```

**Zoom Algorithm**:
```javascript
function calculateOptimalCanvasWidth(zoomLevel, dataPointCount) {
    const containerWidth = container.clientWidth || 800;
    if (zoomLevel <= 1.0) {
        // At 100% and below: fit container
        return Math.max(400, containerWidth * zoomLevel);
    } else {
        // Above 100%: expand significantly to enable scrolling
        return Math.max(containerWidth, containerWidth * zoomLevel * 1.5);
    }
}
```

**Benefits**:
- **Detailed Analysis**: Examine dense data points with precision
- **Accessibility**: Better readability for charts with many data points
- **User Experience**: Intuitive zoom controls similar to image viewers
- **Data Exploration**: Navigate large datasets without losing context

---

## Recent Fixes (April 2026)

### Issue: Incorrect Test Case Created Count
**Problem**: Dashboard showed 143 stories with "Test Case Created = Yes" instead of 319
**Root Cause**: JIRA checkbox field returns array format `[{value: "Yes"}]`, extraction function expected simple strings
**Solution**: Updated `getTestCaseCreated()` to handle JIRA array format
**Result**: Now correctly shows 319 stories (matches JIRA CSV export)

### Issue: Inconsistent Sprint Logic Across Issue Types
**Problem**: Different sprint extraction logic for Bugs vs Stories/Test Cases
- Bugs: Used simple field extraction (correct)
- Stories/Test Cases: Used complex changelog parsing (inconsistent)
**Root Cause**: Historical code evolution led to different approaches
**Solution**: Unified all issue types to use same logic (earliest sprint by startDate)
**Result**: 1,535 issues had sprint assignments corrected

### Implementation Details:
```javascript
// BEFORE: Inconsistent sprint logic
if (issueType === 'Story') {
    // Complex changelog parsing...
} else {
    // Simple field extraction...
}

// AFTER: Unified for all issue types
const earliestSprint = FIELD_EXTRACTORS.getSprintName(issue.fields.customfield_10020);
baseIssue.sprintName = earliestSprint;
baseIssue.sprint = earliestSprint;
```

### Data Impact:
- **Total Issues Processed**: 6,078
- **Stories Fixed**: Test Case Created field corrected for all stories
- **Sprint Logic**: Fixed for 1,535 issues across all types
- **Data Accuracy**: Now matches JIRA source data exactly

---

## Troubleshooting

### Common Issues:

#### Dashboard Shows Old Data
**Symptoms**: Filters show incorrect counts, data doesn't match JIRA
**Solution**: 
1. Check API server status: `curl http://localhost:3002/health`
2. Trigger fresh sync: `POST /api/sync-issues`
3. Verify cache timestamp in `issues-cache.json`

#### Field Extraction Errors
**Symptoms**: Fields show "null" or incorrect values
**Debug Steps**:
1. Check JIRA field mappings in `jira-field-mappings.js`
2. Test extraction functions with sample data
3. Verify JIRA API permissions and field access

#### Module Caching Issues
**Symptoms**: Code changes not reflected in API responses
**Solution**: Restart API server to clear Node.js module cache
```bash
pkill -f "node bug-api-server.js"
node bug-api-server.js
```

### Debugging Tools:

#### Debug Single Issue:
```javascript
// Test specific issue extraction
const issue = await jiraClient.makeRequest('/rest/api/3/issue/BT-12421');
const extracted = FIELD_EXTRACTORS.getTestCaseCreated(issue.fields.customfield_11391);
console.log('Extracted:', extracted);
```

#### Cache Inspection:
```javascript
// Check cache data
const cache = JSON.parse(fs.readFileSync('issues-cache.json', 'utf8'));
const bt12421 = cache.issues.find(i => i.key === 'BT-12421');
console.log('Cached data:', bt12421);
```

---

## Future Development

### Recommended Enhancements:

#### Performance Optimizations:
- **Incremental Sync**: Only fetch changed issues since last sync
- **Field Caching**: Cache field mappings to reduce API calls
- **Pagination**: Implement client-side pagination for large datasets

#### New Features:
- **Custom Dashboards**: User-configurable dashboard layouts
- **Alerts**: Notification system for critical issues
- **Trend Analysis**: Historical data tracking and trends
- **Advanced Reporting**: PDF/Excel report generation

#### Data Quality Improvements:
- **Field Validation**: Real-time validation of JIRA field changes
- **Data Consistency**: Automated checks for data integrity
- **Audit Logging**: Track all data changes and sync operations

### Technical Debt:
- **Code Consolidation**: Merge `bugs-cache.json` into unified cache
- **API Versioning**: Implement versioned API endpoints
- **Error Handling**: Improve error messages and recovery mechanisms
- **Testing**: Add comprehensive unit and integration tests

---

## Configuration Files

### Environment Variables (`.env`):
```bash
JIRA_DOMAIN=hibob.atlassian.net
JIRA_EMAIL=guy.levin@hibob.io
JIRA_API_TOKEN=your-api-token-here
```

### Server Configuration:
- **API Server Port**: 3002
- **Dashboard Port**: 8090 (HTTP server)
- **Cache Location**: Project root directory
- **Log Files**: `sync-output.log`, `api-server.log`

---

## Data Schema

### Issue Object Structure:
```javascript
{
    // Universal fields
    "id": "41481",
    "key": "BT-13419",
    "project": "BT",
    "summary": "Install Netsuite Suitapp...",
    "status": "Done",
    "priority": "Medium",
    "assignee": "Rottem Wolf",
    "reporter": "Rottem Wolf",
    "created": "2026-04-23T14:58:30.366+0300",
    "updated": "2026-04-23T17:37:57.899+0300",
    "createdDate": "4/23/2026",
    "updatedDate": "4/23/2026",
    "daysOpen": 4,
    "leadingTeam": "MIS - CORP",
    "system": "Netsuite",
    "sprintName": "PI2.26.Sprint 2 (9/3 - 30/3)",
    "sprint": "PI2.26.Sprint 2 (9/3 - 30/3)",
    "components": [],
    "labels": [],
    "issueType": "Story",
    
    // Story-specific fields
    "storyPoints": 0,
    "epicLink": "BT-13092",
    "testCaseCreated": "Yes",
    "resolutionDate": "2026-04-23T17:37:57.899+0300",
    "resolutionDateFormatted": "4/23/2026",
    "fixDuration": 1,
    
    // Bug-specific fields (when issueType === 'Bug')
    "regression": "Yes",
    "severity": "High",
    "bugType": "Production",
    
    // Test Case-specific fields (when issueType === 'Test')
    "aiGeneratedTestCases": "https://chatgpt.com/...",
    "testType": "Automated",
    
    "description": "..."
}
```

---

## Monitoring and Maintenance

### Health Checks:
- **API Health**: `GET /health` - Server status and uptime
- **Data Freshness**: Check `lastSync` timestamp in cache files
- **JIRA Connectivity**: Verify API token and permissions

### Maintenance Schedule:
- **Daily**: Monitor sync performance and error logs
- **Weekly**: Review data quality metrics and field completeness
- **Monthly**: Update JIRA field mappings if new custom fields added
- **Quarterly**: Performance optimization and code review

### Backup Strategy:
- **Automatic**: Cache backups created before each sync
- **Manual**: Export critical data before major changes
- **Retention**: Keep 30 days of backup files

---

## Support and Contact

### For Future Agents:
This documentation provides comprehensive context for understanding and maintaining the Multi-Dashboard System. When making changes:

1. **Always test with single issues first** (e.g., BT-12421)
2. **Create backups** before major data operations
3. **Update this documentation** when making architectural changes
4. **Verify against JIRA source data** after changes
5. **Test all issue types** (Bugs, Stories, Test Cases) to ensure consistency

### Key Success Metrics:
- **Data Accuracy**: 319 Stories with "Test Case Created = Yes" (matches JIRA)
- **Performance**: Full sync of 6,078 issues in ~68 seconds
- **Reliability**: Zero data loss with automatic backups
- **Usability**: Real-time filtering and interactive dashboards

---

*Last Updated: April 26, 2026*
*System Version: Multi-Dashboard v2.0 (Post-Field-Extraction-Fixes)*