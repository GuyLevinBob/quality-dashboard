# Multi-Dashboard System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Data Sources & Caching](#data-sources--caching)
4. [Field Extraction Logic](#field-extraction-logic)
5. [Filtering System](#filtering-system)
6. [API Endpoints](#api-endpoints)
7. [Dashboard Features](#dashboard-features)
8. [Testing Coverage Analytics](#testing-coverage-analytics)
9. [Recent Fixes (April 2026)](#recent-fixes-april-2026)
10. [Troubleshooting](#troubleshooting)
11. [Future Development](#future-development)

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
    STORY_POINTS: 'customfield_10032',        // Number: Story points (CORRECTED April 27, 2026)
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

#### `GET /api/testing-coverage`
- **Purpose**: Specialized endpoint for Testing Coverage Analytics
- **Function**: Returns stories filtered for testing coverage analysis
- **Filtering Criteria**:
  - Issue type: Story only
  - Story Points: ≥0.5 points
  - Teams: MIS - GTM, MIS - GTC, MIS - CORP, MIS - Platform
  - Status: Not cancelled or rejected
- **Response Format**:
  ```json
  {
    "stories": [...],  // Filtered stories array
    "total": 866,      // Total qualifying stories
    "metadata": {
      "teamBreakdown": {
        "MIS - CORP": 338,
        "MIS - GTM": 210,
        "MIS - GTC": 309,
        "MIS - Platform": 9
      },
      "testCaseBreakdown": {
        "No": 780,
        "Yes": 86
      },
      "filtering": {
        "inputStories": 4361,
        "outputStories": 866,
        "filterEfficiency": "20%"
      }
    }
  }
  ```

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
7. **Testing Coverage Analytics** (Dedicated section with KPIs and team breakdowns)

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

## Testing Coverage Analytics

### Overview
The Testing Coverage Analytics feature provides comprehensive insights into test case creation for stories across MIS teams. It tracks which stories have associated test cases created and provides team-by-team breakdowns.

### Key Features:

#### Data Source & Filtering
- **Source**: Dedicated `/api/testing-coverage` endpoint
- **Scope**: Stories with ≥0.5 story points across MIS teams
- **Team Coverage**: MIS - GTM, MIS - GTC, MIS - CORP, MIS - Platform
- **Status Filter**: Excludes cancelled/rejected stories

#### Visual Components:

##### Overall Coverage KPI
- **Main Metric**: Overall testing coverage percentage
- **Display**: Large prominently displayed card with gradient styling
- **Calculation**: (Stories with test cases / Total eligible stories) × 100%
- **Example**: "15% Overall Testing Coverage (86 of 866 eligible stories)"

##### Team-Specific KPIs
- **MIS - CORP**: Individual coverage percentage and count
- **MIS - GTM**: Individual coverage percentage and count  
- **MIS - GTC**: Individual coverage percentage and count
- **MIS - Platform**: Individual coverage percentage and count
- **Visual Design**: Cards with team-specific styling and hover effects

##### Coverage Details Table
- **Expandable Interface**: "Show Coverage Details" button
- **Sortable Columns**: Key, Summary, Team, Story Points, Test Case Created, Sprint
- **Interactive Filtering**: Filter by sprint selection
- **Data Export**: Supports CSV export functionality

#### Sprint-Based Filtering
- **Sprint Selector**: Multi-select dropdown for sprint filtering
- **"All Sprints" Option**: View data across all time periods
- **Dynamic Updates**: Real-time filtering of coverage data
- **Sprint Statistics**: Shows filtered vs total story counts

#### Brand Alignment (HiBob Design System)
- **Color Scheme**: 
  - Primary: Cherry Syrup (#EE164F)
  - Secondary: Orange Juice (#FAA32B)
  - Background: Black Coffee (#3A3A37)
- **Typography**:
  - Headers: Archivo Black
  - Subheaders: Domine
  - Body text: Lato
- **Design Elements**:
  - Organic rounded shapes
  - Gradient overlays
  - Subtle shadows and hover effects

### Technical Implementation:

#### Frontend Integration (`dashboard-multi-issue.html`):
```javascript
// Global data management
let testingCoverageData = [];

// Load testing coverage data
async function loadTestingCoverageData() {
    try {
        const response = await fetch(`${API_BASE}/api/testing-coverage`);
        const data = await response.json();
        testingCoverageData = data.stories;
        console.log(`✅ Loaded ${testingCoverageData.length} testing coverage stories`);
        return true;
    } catch (error) {
        console.error('❌ Failed to load testing coverage data:', error);
        // Fallback to manual filtering from existing data
        return false;
    }
}

// Calculate coverage metrics
function calculateTestingCoverage(filteredData = testingCoverageData) {
    const storiesWithTestCases = filteredData.filter(story => 
        story.testCaseCreated === 'Yes'
    );
    return Math.round((storiesWithTestCases.length / filteredData.length) * 100);
}
```

#### Backend Processing (`api/bug-api-server.js`):
```javascript
async handleTestingCoverage(req, res) {
    try {
        const issuesData = this.loadCachedIssuesData();
        const allStories = issuesData.issues.filter(issue => 
            issue.issueType === 'Story'
        );
        
        // Apply testing coverage filters
        const filteredStories = allStories.filter(story => {
            const storyPoints = parseFloat(story.storyPoints) || 0;
            const isEligiblePoints = storyPoints >= 0.5;
            const isValidStatus = !['Canceled', 'Reject', 'Rejected'].includes(story.status);
            const isValidTeam = ['MIS - GTM', 'MIS - GTC', 'MIS - CORP', 'MIS - Platform']
                .includes(story.leadingTeam);
            
            return isEligiblePoints && isValidStatus && isValidTeam;
        });
        
        // Generate analytics
        const teamBreakdown = {};
        const testCaseBreakdown = {};
        
        filteredStories.forEach(story => {
            const team = story.leadingTeam || 'No Team';
            teamBreakdown[team] = (teamBreakdown[team] || 0) + 1;
            
            const testCase = story.testCaseCreated || 'No';
            testCaseBreakdown[testCase] = (testCaseBreakdown[testCase] || 0) + 1;
        });
        
        this.sendJson(res, {
            stories: filteredStories,
            total: filteredStories.length,
            metadata: {
                teamBreakdown,
                testCaseBreakdown,
                filtering: {
                    inputStories: allStories.length,
                    outputStories: filteredStories.length,
                    filterEfficiency: Math.round((filteredStories.length / allStories.length) * 100) + '%'
                }
            }
        });
    } catch (error) {
        this.sendError(res, 500, 'Testing coverage endpoint failed', error.message);
    }
}
```

### Data Analysis Insights:

#### Coverage Statistics (Current):
- **Total Eligible Stories**: 866 stories (≥0.5 points, MIS teams)
- **Stories with Test Cases**: 86 stories (15% coverage)
- **Team Distribution**:
  - MIS - CORP: 338 stories (39% of total)
  - MIS - GTC: 309 stories (36% of total)
  - MIS - GTM: 210 stories (24% of total)
  - MIS - Platform: 9 stories (1% of total)

#### Quality Metrics:
- **Data Completeness**: 100% (all stories have test case status)
- **Filter Efficiency**: 20% (866 out of 4,361 total stories)
- **Team Coverage**: All 4 MIS teams included

### Usage Guidelines:

#### For Product Managers:
- **Coverage Tracking**: Monitor test case creation across teams
- **Sprint Planning**: Identify stories needing test case attention
- **Team Performance**: Compare testing practices between teams

#### For QA Teams:
- **Gap Analysis**: Identify stories without test cases
- **Sprint Focus**: Prioritize test case creation by sprint
- **Compliance**: Ensure testing standards are met

#### For Engineering Managers:
- **Process Improvement**: Track testing culture adoption
- **Resource Planning**: Allocate QA resources based on coverage gaps
- **Quality Metrics**: Measure testing maturity over time

### Enhanced User Interface (April 27, 2026)

#### Testing Coverage Details Section Improvements:

##### Interactive Table Controls:
- **Hide/Show Details Toggle**: 
  - Functional "Hide Details ▲" button that properly collapses and expands the details table
  - Button text updates dynamically: "Hide Details ▲" ↔ "Show Coverage Details ▼"
  - State synchronized between header button and section toggle button
  
- **Optimized Table Layout**:
  - **Fixed Right-Side Spacing**: Eliminated blank space to the right of the table
  - **Proper Scroller Alignment**: Vertical scrollbar aligned to the right edge
  - **Responsive Container**: Table container uses full width with proper overflow handling
  - **Custom Scrollbar Styling**: Enhanced visual appearance of the scrollbar

##### Advanced Column Sorting:
- **Multi-Column Support**: All table columns are sortable (Key, Summary, Team, Story Points, Test Case Created, Sprint, Status)
- **Bi-Directional Sorting**: Click once for ascending (↑), click again for descending (↓)
- **Type-Aware Sorting**:
  - **Numeric Fields**: Story Points sorted as numbers, not strings
  - **Boolean Fields**: Test Case Created sorted as Yes/No with proper priority
  - **String Fields**: Case-insensitive alphabetical sorting
- **Visual Indicators**: Sort arrows (↕ ↑ ↓) with active column highlighting
- **State Preservation**: Sort state maintained during filtering operations

##### Enhanced Jira Integration:
- **Clickable Story Keys**: Each story key is a direct link to the corresponding Jira issue
- **External Link Behavior**: Links open in new tabs (`target="_blank"`)
- **Consistent Styling**: Links styled to match existing issue link patterns
- **URL Format**: `https://hibob.atlassian.net/browse/{story.key}`

#### Advanced KPI Tile Filtering:

##### Combined Filter Logic:
- **Intelligent Team + Sprint Filtering**:
  - **"All Sprints" Mode**: Team filter applies across all time periods
  - **Specific Sprint Mode**: Applies both team AND sprint filters simultaneously
  - **Expected Behavior**: Platform team in "PI3.26.Sprint 1 (30/3 -27/4) 2" shows 2 stories (not 9 or 55)

##### KPI Tile Interactions:
- **Team-Specific Tiles**: Each team KPI tile (CORP, GTM, GTC, Platform) functions as a filter button
- **Overall Coverage Tile**: Resets team filter while preserving sprint selection
- **Visual Feedback**: Active filters highlighted with `active-filter` class styling
- **State Management**: Filter states persist across table operations and sorting

##### Sprint Filter Integration:
- **Dropdown Synchronization**: Sprint selection properly retained during team filtering
- **Auto-Sync Logic**: Automatic detection and correction of sprint filter desynchronization
- **State Persistence**: Sprint selection survives page operations and filter combinations
- **UI Consistency**: Dropdown button text always matches internal filter state

#### Technical Implementation Details:

##### Bug Fixes Applied (April 27, 2026):
1. **Hide Details Button**: Added missing `onclick` attribute to table header button
2. **Sprint Filter Parameter Bug**: Fixed `applyCombinedCoverageFilters` default parameter from `null` to `undefined`
3. **Sort State Preservation**: Modified `updateCoverageDetailsTable` to preserve sort state when displaying sorted data
4. **Event Listener Duplication**: Prevented duplicate click handlers on KPI tiles
5. **Filter Race Conditions**: Eliminated table override issues during combined filtering operations

##### Enhanced Debug Functions:
```javascript
// Available in browser console for troubleshooting
testSprintSelection(sprintName)     // Test sprint dropdown selection
testSorting()                       // Test table sorting functionality  
testSortingWithFilters()           // Test sorting with active filters
testUserScenario()                 // Complete user workflow test
resetAllFilters()                  // Clear all filters and reset state
checkDropdownSetup()               // Verify dropdown configuration
testSprintPreservation()           // Test sprint filter preservation
```

##### Performance Optimizations:
- **Conditional Table Updates**: Skip unnecessary table refreshes during filtered operations
- **Event Handler Management**: Proper cleanup and prevention of duplicate listeners
- **State Caching**: `window.lastFilteredResults` caching to prevent redundant filtering
- **DOM Query Optimization**: Cached element references for frequently accessed components

### Future Enhancements:
- **Trend Analysis**: Historical coverage tracking over time
- **Alert System**: Notifications for low coverage sprints
- **Automated Reporting**: Scheduled coverage reports
- **Integration**: Connect with test execution platforms
- **Advanced Filtering**: Date range filters for sprint-based analysis
- **Export Enhancements**: Filtered data export with applied sorting

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

### Issue: Incorrect Story Points Field Mapping
**Problem**: Testing Coverage Analytics showed only 34 stories instead of expected ~866
**Root Cause**: Story points field mapping pointed to wrong JIRA custom field
- **Incorrect Field**: `customfield_10016` (always returned null)
- **Correct Field**: `customfield_10032` (contains actual story points)
**Solution**: Updated field mapping in `jira-field-mappings.js`
**Result**: Now correctly returns 866 eligible stories with proper story points

### Data Impact:
- **Total Issues Processed**: 6,111
- **Stories Fixed**: Test Case Created field corrected for all stories
- **Sprint Logic**: Fixed for 1,535 issues across all types
- **Story Points**: Corrected field mapping affects 866 stories in testing coverage
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
    "storyPoints": 2,        // From customfield_10032 (corrected April 27, 2026)
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
- **Testing Coverage**: 866 eligible stories for coverage analysis (correct filtering)
- **Performance**: Full sync of 6,111 issues in ~70 seconds
- **Reliability**: Zero data loss with automatic backups
- **Usability**: Real-time filtering and interactive dashboards with dedicated analytics

---

*Last Updated: April 27, 2026*
*System Version: Multi-Dashboard v2.2 (Enhanced Testing Coverage UI + Interactive KPI Filtering + Advanced Sorting)*