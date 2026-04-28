/**
 * Testing Coverage Analytics Backend Implementation
 * 
 * This file implements the /api/testing-coverage endpoint that fetches
 * stories from JIRA using the exact JQL query requirements and applies
 * proper data transformation.
 * 
 * Add this to your existing Express.js server or integrate the functions
 * into your current backend structure.
 */

const express = require('express');
const fetch = require('node-fetch'); // or your preferred HTTP client

// === CONFIGURATION ===
// Update these to match your JIRA configuration
const JIRA_CONFIG = {
    baseUrl: process.env.JIRA_BASE_URL || 'https://your-domain.atlassian.net',
    username: process.env.JIRA_USERNAME || 'your-email@company.com', 
    apiToken: process.env.JIRA_API_TOKEN || 'your-api-token',
    maxResults: 1000 // Adjust based on your needs
};

// === UTILITY FUNCTIONS ===

/**
 * Transform testCaseCreated field from JIRA checkbox format to simple string
 * Handles all the various formats JIRA might return
 */
function transformTestCaseField(testCaseCreated) {
    if (!testCaseCreated) return 'No';
    
    // Handle array format (JIRA checkbox)
    if (Array.isArray(testCaseCreated)) {
        return testCaseCreated.includes('Yes') ? 'Yes' : 'No';
    }
    
    // Handle object format with nested value
    if (typeof testCaseCreated === 'object' && testCaseCreated !== null) {
        const value = testCaseCreated.value || testCaseCreated;
        if (Array.isArray(value)) {
            return value.includes('Yes') ? 'Yes' : 'No';
        }
        return value === 'Yes' ? 'Yes' : 'No';
    }
    
    // Handle string format (already processed)
    return testCaseCreated === 'Yes' ? 'Yes' : 'No';
}

/**
 * Create JIRA API authentication headers
 */
function getJiraHeaders() {
    const auth = Buffer.from(`${JIRA_CONFIG.username}:${JIRA_CONFIG.apiToken}`).toString('base64');
    return {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
}

/**
 * Execute JQL query against JIRA API with pagination support
 */
async function executeJqlQuery(jql, startAt = 0, maxResults = 100) {
    const url = `${JIRA_CONFIG.baseUrl}/rest/api/3/search`;
    
    const requestBody = {
        jql: jql,
        startAt: startAt,
        maxResults: maxResults,
        fields: [
            'key',
            'summary', 
            'status',
            'customfield_10020', // Story Points (adjust field ID)
            'customfield_10021', // Leading Team (adjust field ID)
            'customfield_10022', // Test Case Created (adjust field ID)
            'customfield_10023', // Sprint (adjust field ID)
            'created',
            'updated',
            'assignee',
            'reporter',
            'priority',
            'components',
            'fixVersions',
            'labels'
        ]
    };

    console.log(`🔍 Executing JQL query: ${jql}`);
    console.log(`📍 Starting at: ${startAt}, maxResults: ${maxResults}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: getJiraHeaders(),
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`JIRA API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`✅ Retrieved ${data.issues.length} issues (${data.startAt + 1} to ${data.startAt + data.issues.length} of ${data.total})`);
        
        return data;
    } catch (error) {
        console.error('❌ JIRA API request failed:', error);
        throw error;
    }
}

/**
 * Fetch all stories matching the testing coverage criteria with pagination
 */
async function fetchTestingCoverageStories() {
    // Exact JQL query as specified in requirements
    const jql = `
        type = Story
        AND status NOT IN (Canceled, Reject, Rejected)
        AND "leading team[dropdown]" IN ("MIS - GTM", "MIS - GTC", "MIS - CORP", "MIS - Platform") 
        AND "story points[number]" > "0.5"
        ORDER BY created DESC
    `.trim().replace(/\s+/g, ' '); // Clean up whitespace

    let allStories = [];
    let startAt = 0;
    const maxResults = 100; // JIRA API limit per request
    let totalAvailable = 0;

    try {
        // First request to get total count
        const firstPage = await executeJqlQuery(jql, startAt, maxResults);
        totalAvailable = firstPage.total;
        allStories.push(...firstPage.issues);

        console.log(`📊 Found ${totalAvailable} total stories matching criteria`);

        // Fetch remaining pages if necessary
        while (allStories.length < totalAvailable) {
            startAt += maxResults;
            console.log(`🔄 Fetching page ${Math.floor(startAt / maxResults) + 1}...`);
            
            const nextPage = await executeJqlQuery(jql, startAt, maxResults);
            allStories.push(...nextPage.issues);

            // Safety check to prevent infinite loops
            if (nextPage.issues.length === 0) {
                console.log('⚠️ No more issues returned, breaking pagination loop');
                break;
            }
        }

        console.log(`✅ Retrieved ${allStories.length} stories total`);
        return { stories: allStories, total: totalAvailable };

    } catch (error) {
        console.error('❌ Failed to fetch testing coverage stories:', error);
        throw error;
    }
}

/**
 * Transform JIRA issue data to dashboard format
 */
function transformJiraIssue(jiraIssue) {
    const fields = jiraIssue.fields;
    
    // Map custom fields to readable names (adjust field IDs based on your JIRA config)
    const storyPoints = fields.customfield_10020 || 0;
    const leadingTeam = fields.customfield_10021?.value || fields.customfield_10021 || null;
    const testCaseCreated = fields.customfield_10022;
    const sprint = fields.customfield_10023?.[0]?.name || null;

    return {
        key: jiraIssue.key,
        summary: fields.summary,
        status: fields.status.name,
        storyPoints: storyPoints,
        leadingTeam: leadingTeam,
        testCaseCreated: transformTestCaseField(testCaseCreated), // Apply transformation
        sprint: sprint,
        created: fields.created,
        updated: fields.updated,
        assignee: fields.assignee?.displayName || null,
        reporter: fields.reporter?.displayName || null,
        priority: fields.priority?.name || null,
        components: fields.components?.map(c => c.name) || [],
        fixVersions: fields.fixVersions?.map(v => v.name) || [],
        labels: fields.labels || [],
        issueType: 'Story' // Ensure issue type is set
    };
}

/**
 * Cache management for testing coverage data
 */
class TestingCoverageCache {
    constructor(ttlMinutes = 10) {
        this.cache = null;
        this.lastFetch = null;
        this.ttl = ttlMinutes * 60 * 1000; // Convert to milliseconds
    }

    isValid() {
        return this.cache && this.lastFetch && (Date.now() - this.lastFetch < this.ttl);
    }

    set(data) {
        this.cache = data;
        this.lastFetch = Date.now();
        console.log(`💾 Cached ${data.stories.length} testing coverage stories`);
    }

    get() {
        if (this.isValid()) {
            console.log(`📦 Using cached testing coverage data (${this.cache.stories.length} stories)`);
            return this.cache;
        }
        return null;
    }

    clear() {
        this.cache = null;
        this.lastFetch = null;
        console.log('🗑️ Testing coverage cache cleared');
    }
}

// Global cache instance
const testingCoverageCache = new TestingCoverageCache(10); // 10 minute cache

// === EXPRESS ROUTES ===

/**
 * GET /api/testing-coverage
 * 
 * Returns stories that match the testing coverage criteria.
 * Implements caching to avoid excessive JIRA API calls.
 */
async function getTestingCoverage(req, res) {
    console.log('🎯 Testing coverage endpoint called');
    
    try {
        // Check cache first (unless cache busting parameter provided)
        const cacheBuster = req.query._ || req.query.fresh;
        if (!cacheBuster) {
            const cachedData = testingCoverageCache.get();
            if (cachedData) {
                return res.json(cachedData);
            }
        } else {
            console.log('🔄 Cache busting requested, fetching fresh data');
        }

        // Fetch fresh data from JIRA
        console.log('🔄 Fetching fresh testing coverage data from JIRA...');
        const jiraResult = await fetchTestingCoverageStories();
        
        // Transform JIRA issues to dashboard format
        const transformedStories = jiraResult.stories.map(transformJiraIssue);
        
        // Validate transformations
        const testCaseStats = {
            yes: transformedStories.filter(s => s.testCaseCreated === 'Yes').length,
            no: transformedStories.filter(s => s.testCaseCreated === 'No').length,
            other: transformedStories.filter(s => s.testCaseCreated !== 'Yes' && s.testCaseCreated !== 'No').length
        };

        console.log('📊 TestCase transformation results:', testCaseStats);

        // Build response
        const response = {
            stories: transformedStories,
            total: transformedStories.length,
            metadata: {
                query: 'Testing Coverage Analytics',
                criteria: 'Stories ≥0.5 points, valid teams (MIS - GTM/GTC/CORP/Platform), not cancelled/rejected',
                timestamp: new Date().toISOString(),
                teams: ['MIS - GTM', 'MIS - GTC', 'MIS - CORP', 'MIS - Platform'],
                jql: 'type = Story AND status NOT IN (Canceled, Reject, Rejected) AND "leading team[dropdown]" IN ("MIS - GTM", "MIS - GTC", "MIS - CORP", "MIS - Platform") AND "story points[number]" > "0.5"',
                testCaseStats: testCaseStats,
                fetchedFromCache: false
            }
        };

        // Cache the result
        testingCoverageCache.set(response);

        console.log(`✅ Testing coverage endpoint completed: ${response.total} stories`);
        res.json(response);

    } catch (error) {
        console.error('❌ Testing coverage endpoint error:', error);
        
        // Return error with helpful information
        res.status(500).json({
            error: 'Failed to fetch testing coverage data',
            message: error.message,
            timestamp: new Date().toISOString(),
            suggestion: 'Check JIRA connectivity and custom field mappings'
        });
    }
}

/**
 * POST /api/testing-coverage/refresh
 * 
 * Force refresh of testing coverage data (clears cache and fetches fresh data)
 */
async function refreshTestingCoverage(req, res) {
    console.log('🔄 Testing coverage refresh requested');
    
    try {
        // Clear cache
        testingCoverageCache.clear();
        
        // Fetch fresh data
        req.query.fresh = 'true'; // Force fresh fetch
        await getTestingCoverage(req, res);
        
    } catch (error) {
        console.error('❌ Testing coverage refresh error:', error);
        res.status(500).json({
            error: 'Failed to refresh testing coverage data',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Integration with existing sync mechanism
 * Call this function when the main sync operation completes
 */
async function syncTestingCoverageData() {
    console.log('🔄 Syncing testing coverage data as part of main sync...');
    
    try {
        // Clear cache to force fresh fetch on next request
        testingCoverageCache.clear();
        
        // Optionally pre-populate cache
        const jiraResult = await fetchTestingCoverageStories();
        const transformedStories = jiraResult.stories.map(transformJiraIssue);
        
        const response = {
            stories: transformedStories,
            total: transformedStories.length,
            metadata: {
                query: 'Testing Coverage Analytics',
                timestamp: new Date().toISOString(),
                teams: ['MIS - GTM', 'MIS - GTC', 'MIS - CORP', 'MIS - Platform'],
                syncedWithMain: true
            }
        };

        testingCoverageCache.set(response);
        console.log(`✅ Testing coverage sync completed: ${response.total} stories cached`);
        
        return response;
        
    } catch (error) {
        console.error('❌ Testing coverage sync failed:', error);
        throw error;
    }
}

// === EXPRESS SETUP ===

/**
 * Add these routes to your existing Express app
 */
function setupTestingCoverageRoutes(app) {
    // Main testing coverage endpoint
    app.get('/api/testing-coverage', getTestingCoverage);
    
    // Force refresh endpoint  
    app.post('/api/testing-coverage/refresh', refreshTestingCoverage);
    
    // Cache status endpoint (for debugging)
    app.get('/api/testing-coverage/status', (req, res) => {
        const cacheValid = testingCoverageCache.isValid();
        const cacheAge = testingCoverageCache.lastFetch ? 
            Math.round((Date.now() - testingCoverageCache.lastFetch) / 1000) : null;
            
        res.json({
            cacheValid: cacheValid,
            cacheAgeSeconds: cacheAge,
            cachedStories: testingCoverageCache.cache?.stories?.length || 0,
            lastFetch: testingCoverageCache.lastFetch ? new Date(testingCoverageCache.lastFetch).toISOString() : null
        });
    });

    console.log('✅ Testing coverage routes registered');
}

// === INTEGRATION WITH EXISTING SYNC ===

/**
 * Modify your existing sync-issues endpoint to also sync testing coverage
 * 
 * Example integration:
 */
async function enhancedSyncIssues(req, res) {
    try {
        // Your existing sync logic here
        console.log('🔄 Starting enhanced sync (issues + testing coverage)...');
        
        // 1. Run your existing sync process
        // await existingSyncProcess();
        
        // 2. Sync testing coverage data
        await syncTestingCoverageData();
        
        res.json({
            success: true,
            message: 'Sync completed successfully',
            timestamp: new Date().toISOString(),
            includes: ['bugs', 'stories', 'tests', 'testing-coverage']
        });
        
    } catch (error) {
        console.error('❌ Enhanced sync failed:', error);
        res.status(500).json({
            error: 'Sync failed',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

// === EXPORTS ===

module.exports = {
    setupTestingCoverageRoutes,
    syncTestingCoverageData,
    getTestingCoverage,
    refreshTestingCoverage,
    enhancedSyncIssues,
    testingCoverageCache,
    JIRA_CONFIG // Export for configuration
};

// === USAGE EXAMPLE ===

/*
// In your main Express app file:

const express = require('express');
const { setupTestingCoverageRoutes } = require('./backend-testing-coverage');

const app = express();

// Your existing middleware and routes...

// Add testing coverage routes
setupTestingCoverageRoutes(app);

// Modify your existing sync endpoint (example)
app.post('/api/sync-issues', async (req, res) => {
    // Use the enhanced sync that includes testing coverage
    await enhancedSyncIssues(req, res);
});

app.listen(3002, () => {
    console.log('✅ Server running with testing coverage support');
});
*/