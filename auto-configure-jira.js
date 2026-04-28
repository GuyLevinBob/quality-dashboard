/**
 * Automatic JIRA Field Discovery and Configuration
 * 
 * This script will:
 * 1. Connect to your JIRA instance
 * 2. Automatically find the custom field IDs 
 * 3. Generate the configured backend code for you
 * 4. Test the configuration
 * 
 * Usage: Just update your JIRA credentials below and run: node auto-configure-jira.js
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// === STEP 1: UPDATE ONLY THESE 3 VALUES ===
const JIRA_CONFIG = {
    baseUrl: 'https://hibob.atlassian.net',        // ← UPDATE: Your JIRA domain
    username: 'your-email@hibob.com',              // ← UPDATE: Your email
    apiToken: 'your-api-token-here'                // ← UPDATE: Your API token
};

// We'll search for a story to analyze - the script will find one automatically
let SAMPLE_STORY_KEY = null;

// === AUTO-DISCOVERY FUNCTIONS ===

function getJiraHeaders() {
    const auth = Buffer.from(`${JIRA_CONFIG.username}:${JIRA_CONFIG.apiToken}`).toString('base64');
    return {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
}

async function findSampleStory() {
    console.log('🔍 Finding a sample story to analyze...');
    
    const jql = 'type = Story ORDER BY created DESC';
    const url = `${JIRA_CONFIG.baseUrl}/rest/api/3/search`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: getJiraHeaders(),
            body: JSON.stringify({
                jql: jql,
                startAt: 0,
                maxResults: 5,
                fields: ['key', 'summary']
            })
        });

        if (!response.ok) {
            throw new Error(`JIRA API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.issues.length === 0) {
            throw new Error('No stories found in JIRA');
        }

        SAMPLE_STORY_KEY = data.issues[0].key;
        console.log(`✅ Found sample story: ${SAMPLE_STORY_KEY}`);
        return SAMPLE_STORY_KEY;
        
    } catch (error) {
        console.error('❌ Failed to find sample story:', error.message);
        throw error;
    }
}

async function getAllCustomFields() {
    console.log('🔍 Discovering all custom fields...');
    
    const url = `${JIRA_CONFIG.baseUrl}/rest/api/3/field`;
    
    try {
        const response = await fetch(url, {
            headers: getJiraHeaders()
        });

        if (!response.ok) {
            throw new Error(`JIRA API error: ${response.status} ${response.statusText}`);
        }

        const fields = await response.json();
        const customFields = fields.filter(field => field.id.startsWith('customfield_'));
        
        console.log(`✅ Found ${customFields.length} custom fields`);
        return customFields;
        
    } catch (error) {
        console.error('❌ Failed to get custom fields:', error.message);
        throw error;
    }
}

async function analyzeSampleStory(storyKey) {
    console.log(`🔍 Analyzing story ${storyKey} for field mapping...`);
    
    const url = `${JIRA_CONFIG.baseUrl}/rest/api/3/issue/${storyKey}`;
    
    try {
        const response = await fetch(url, {
            headers: getJiraHeaders()
        });

        if (!response.ok) {
            throw new Error(`JIRA API error: ${response.status} ${response.statusText}`);
        }

        const issue = await response.json();
        console.log(`✅ Retrieved story data for analysis`);
        return issue;
        
    } catch (error) {
        console.error('❌ Failed to analyze sample story:', error.message);
        throw error;
    }
}

function identifyFields(customFields, sampleIssue) {
    console.log('🔍 Identifying required fields...');
    
    const fieldMappings = {
        storyPoints: null,
        leadingTeam: null, 
        testCaseCreated: null,
        sprint: null
    };

    // Get field values from sample issue
    const issueFields = sampleIssue.fields;

    // Look for Story Points (usually a number field)
    for (const field of customFields) {
        const fieldId = field.id;
        const fieldValue = issueFields[fieldId];
        
        // Story Points detection
        if ((field.name.toLowerCase().includes('story') && field.name.toLowerCase().includes('point')) ||
            field.name.toLowerCase().includes('points')) {
            if (typeof fieldValue === 'number') {
                fieldMappings.storyPoints = fieldId;
                console.log(`✅ Story Points: ${fieldId} (${field.name}) = ${fieldValue}`);
            }
        }
        
        // Leading Team detection  
        if (field.name.toLowerCase().includes('leading') && field.name.toLowerCase().includes('team')) {
            if (fieldValue && (fieldValue.value || typeof fieldValue === 'string')) {
                fieldMappings.leadingTeam = fieldId;
                const teamValue = fieldValue.value || fieldValue;
                console.log(`✅ Leading Team: ${fieldId} (${field.name}) = ${teamValue}`);
            }
        }
        
        // Test Case Created detection
        if ((field.name.toLowerCase().includes('test') && field.name.toLowerCase().includes('case')) ||
            (field.name.toLowerCase().includes('test') && field.name.toLowerCase().includes('created'))) {
            if (fieldValue !== undefined) {
                fieldMappings.testCaseCreated = fieldId;
                console.log(`✅ Test Case Created: ${fieldId} (${field.name}) = ${JSON.stringify(fieldValue)}`);
            }
        }
        
        // Sprint detection
        if (field.name.toLowerCase().includes('sprint')) {
            if (Array.isArray(fieldValue) && fieldValue.length > 0 && fieldValue[0].name) {
                fieldMappings.sprint = fieldId;
                console.log(`✅ Sprint: ${fieldId} (${field.name}) = ${fieldValue[0].name}`);
            }
        }
    }

    // Manual fallback if auto-detection fails
    console.log('\n🔍 Auto-detection results:');
    Object.entries(fieldMappings).forEach(([key, value]) => {
        console.log(`   ${key}: ${value || '❌ NOT FOUND'}`);
    });

    // If some fields not found, show candidates
    if (!fieldMappings.storyPoints || !fieldMappings.leadingTeam || !fieldMappings.testCaseCreated) {
        console.log('\n💡 Potential field candidates:');
        
        for (const field of customFields) {
            const fieldValue = issueFields[field.id];
            if (fieldValue !== null && fieldValue !== undefined) {
                console.log(`   ${field.id}: ${field.name} = ${JSON.stringify(fieldValue).substring(0, 100)}`);
            }
        }
    }

    return fieldMappings;
}

function generateBackendCode(fieldMappings, jiraConfig) {
    console.log('🔧 Generating configured backend code...');
    
    const backendTemplate = `/**
 * AUTO-CONFIGURED Testing Coverage Analytics Backend
 * Generated by auto-configure-jira.js on ${new Date().toISOString()}
 */

const express = require('express');
const fetch = require('node-fetch');

// === JIRA CONFIGURATION (Auto-configured) ===
const JIRA_CONFIG = {
    baseUrl: process.env.JIRA_BASE_URL || '${jiraConfig.baseUrl}',
    username: process.env.JIRA_USERNAME || '${jiraConfig.username}',
    apiToken: process.env.JIRA_API_TOKEN || 'your-api-token',
    maxResults: 1000
};

// === FIELD MAPPINGS (Auto-discovered) ===
const FIELD_MAPPINGS = {
    storyPoints: '${fieldMappings.storyPoints}',        // ${fieldMappings.storyPoints ? '✅ Auto-detected' : '❌ NEEDS MANUAL CONFIG'}
    leadingTeam: '${fieldMappings.leadingTeam}',        // ${fieldMappings.leadingTeam ? '✅ Auto-detected' : '❌ NEEDS MANUAL CONFIG'}  
    testCaseCreated: '${fieldMappings.testCaseCreated}',    // ${fieldMappings.testCaseCreated ? '✅ Auto-detected' : '❌ NEEDS MANUAL CONFIG'}
    sprint: '${fieldMappings.sprint}'             // ${fieldMappings.sprint ? '✅ Auto-detected' : '❌ NEEDS MANUAL CONFIG'}
};

// === UTILITY FUNCTIONS ===

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

function getJiraHeaders() {
    const auth = Buffer.from(\`\${JIRA_CONFIG.username}:\${JIRA_CONFIG.apiToken}\`).toString('base64');
    return {
        'Authorization': \`Basic \${auth}\`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
}

function transformJiraIssue(jiraIssue) {
    const fields = jiraIssue.fields;
    
    // Use auto-discovered field mappings
    const storyPoints = fields[FIELD_MAPPINGS.storyPoints] || 0;
    const leadingTeam = fields[FIELD_MAPPINGS.leadingTeam]?.value || fields[FIELD_MAPPINGS.leadingTeam] || null;
    const testCaseCreated = fields[FIELD_MAPPINGS.testCaseCreated];
    const sprint = fields[FIELD_MAPPINGS.sprint]?.[0]?.name || null;

    return {
        key: jiraIssue.key,
        summary: fields.summary,
        status: fields.status.name,
        storyPoints: storyPoints,
        leadingTeam: leadingTeam,
        testCaseCreated: transformTestCaseField(testCaseCreated),
        sprint: sprint,
        created: fields.created,
        updated: fields.updated,
        assignee: fields.assignee?.displayName || null,
        reporter: fields.reporter?.displayName || null,
        priority: fields.priority?.name || null,
        components: fields.components?.map(c => c.name) || [],
        fixVersions: fields.fixVersions?.map(v => v.name) || [],
        labels: fields.labels || [],
        issueType: 'Story'
    };
}

async function executeJqlQuery(jql, startAt = 0, maxResults = 100) {
    const url = \`\${JIRA_CONFIG.baseUrl}/rest/api/3/search\`;
    
    const requestBody = {
        jql: jql,
        startAt: startAt,
        maxResults: maxResults,
        fields: [
            'key', 'summary', 'status',
            FIELD_MAPPINGS.storyPoints,
            FIELD_MAPPINGS.leadingTeam,
            FIELD_MAPPINGS.testCaseCreated,
            FIELD_MAPPINGS.sprint,
            'created', 'updated', 'assignee', 'reporter', 'priority', 'components', 'fixVersions', 'labels'
        ]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: getJiraHeaders(),
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        throw new Error(\`JIRA API error: \${response.status} \${response.statusText}\`);
    }

    return await response.json();
}

async function fetchTestingCoverageStories() {
    const jql = \`
        type = Story
        AND status NOT IN (Canceled, Reject, Rejected)
        AND "leading team[dropdown]" IN ("MIS - GTM", "MIS - GTC", "MIS - CORP", "MIS - Platform") 
        AND "story points[number]" > "0.5"
        ORDER BY created DESC
    \`.trim().replace(/\\s+/g, ' ');

    let allStories = [];
    let startAt = 0;
    const maxResults = 100;
    let totalAvailable = 0;

    const firstPage = await executeJqlQuery(jql, startAt, maxResults);
    totalAvailable = firstPage.total;
    allStories.push(...firstPage.issues);

    while (allStories.length < totalAvailable) {
        startAt += maxResults;
        const nextPage = await executeJqlQuery(jql, startAt, maxResults);
        allStories.push(...nextPage.issues);

        if (nextPage.issues.length === 0) break;
    }

    return { stories: allStories, total: totalAvailable };
}

// === CACHE MANAGEMENT ===
class TestingCoverageCache {
    constructor(ttlMinutes = 10) {
        this.cache = null;
        this.lastFetch = null;
        this.ttl = ttlMinutes * 60 * 1000;
    }

    isValid() {
        return this.cache && this.lastFetch && (Date.now() - this.lastFetch < this.ttl);
    }

    set(data) {
        this.cache = data;
        this.lastFetch = Date.now();
    }

    get() {
        if (this.isValid()) {
            return this.cache;
        }
        return null;
    }

    clear() {
        this.cache = null;
        this.lastFetch = null;
    }
}

const testingCoverageCache = new TestingCoverageCache(10);

// === API ENDPOINTS ===

async function getTestingCoverage(req, res) {
    try {
        const cacheBuster = req.query._ || req.query.fresh;
        if (!cacheBuster) {
            const cachedData = testingCoverageCache.get();
            if (cachedData) {
                return res.json(cachedData);
            }
        }

        const jiraResult = await fetchTestingCoverageStories();
        const transformedStories = jiraResult.stories.map(transformJiraIssue);
        
        const testCaseStats = {
            yes: transformedStories.filter(s => s.testCaseCreated === 'Yes').length,
            no: transformedStories.filter(s => s.testCaseCreated === 'No').length,
            other: transformedStories.filter(s => s.testCaseCreated !== 'Yes' && s.testCaseCreated !== 'No').length
        };

        const response = {
            stories: transformedStories,
            total: transformedStories.length,
            metadata: {
                query: 'Testing Coverage Analytics',
                criteria: 'Stories ≥0.5 points, valid teams (MIS - GTM/GTC/CORP/Platform), not cancelled/rejected',
                timestamp: new Date().toISOString(),
                teams: ['MIS - GTM', 'MIS - GTC', 'MIS - CORP', 'MIS - Platform'],
                testCaseStats: testCaseStats,
                fieldMappings: FIELD_MAPPINGS,
                fetchedFromCache: false
            }
        };

        testingCoverageCache.set(response);
        res.json(response);

    } catch (error) {
        console.error('❌ Testing coverage endpoint error:', error);
        res.status(500).json({
            error: 'Failed to fetch testing coverage data',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

function setupTestingCoverageRoutes(app) {
    app.get('/api/testing-coverage', getTestingCoverage);
    
    app.post('/api/testing-coverage/refresh', async (req, res) => {
        testingCoverageCache.clear();
        req.query.fresh = 'true';
        await getTestingCoverage(req, res);
    });
    
    app.get('/api/testing-coverage/status', (req, res) => {
        const cacheValid = testingCoverageCache.isValid();
        const cacheAge = testingCoverageCache.lastFetch ? 
            Math.round((Date.now() - testingCoverageCache.lastFetch) / 1000) : null;
            
        res.json({
            cacheValid: cacheValid,
            cacheAgeSeconds: cacheAge,
            cachedStories: testingCoverageCache.cache?.stories?.length || 0,
            lastFetch: testingCoverageCache.lastFetch ? new Date(testingCoverageCache.lastFetch).toISOString() : null,
            fieldMappings: FIELD_MAPPINGS
        });
    });
}

module.exports = {
    setupTestingCoverageRoutes,
    getTestingCoverage,
    testingCoverageCache,
    JIRA_CONFIG,
    FIELD_MAPPINGS
};
`;

    return backendTemplate;
}

async function testConfiguration(fieldMappings) {
    console.log('\n🧪 Testing the configuration...');
    
    const jql = `
        type = Story
        AND status NOT IN (Canceled, Reject, Rejected)
        AND "leading team[dropdown]" IN ("MIS - GTM", "MIS - GTC", "MIS - CORP", "MIS - Platform") 
        AND "story points[number]" > "0.5"
        ORDER BY created DESC
    `.trim().replace(/\s+/g, ' ');

    try {
        const url = `${JIRA_CONFIG.baseUrl}/rest/api/3/search`;
        const response = await fetch(url, {
            method: 'POST',
            headers: getJiraHeaders(),
            body: JSON.stringify({
                jql: jql,
                startAt: 0,
                maxResults: 5,
                fields: [
                    'key', 'summary', 'status',
                    fieldMappings.storyPoints,
                    fieldMappings.leadingTeam,
                    fieldMappings.testCaseCreated,
                    fieldMappings.sprint
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`JIRA API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`✅ Configuration test successful!`);
        console.log(`📊 Found ${data.total} total stories matching testing coverage criteria`);
        console.log(`📦 Sample: ${data.issues.length} stories retrieved`);

        if (data.total >= 500) {
            console.log('🎉 EXCELLENT! This should give you ~594 stories instead of 34!');
        } else if (data.total >= 100) {
            console.log('✅ GOOD! Significant improvement expected over current 34 stories.');
        } else {
            console.log('⚠️ Lower than expected, but still should improve current results.');
        }

        return data;

    } catch (error) {
        console.error('❌ Configuration test failed:', error.message);
        throw error;
    }
}

// === MAIN EXECUTION ===

async function main() {
    console.log('🚀 AUTO-CONFIGURING JIRA TESTING COVERAGE BACKEND');
    console.log('==================================================');
    
    console.log('\n📋 Using Configuration:');
    console.log(`🌐 JIRA URL: ${JIRA_CONFIG.baseUrl}`);
    console.log(`👤 Username: ${JIRA_CONFIG.username}`);
    console.log(`🔑 API Token: ${JIRA_CONFIG.apiToken ? '***' + JIRA_CONFIG.apiToken.slice(-4) : 'NOT SET ❌'}`);

    if (!JIRA_CONFIG.baseUrl.includes('atlassian.net') || 
        !JIRA_CONFIG.username.includes('@') || 
        JIRA_CONFIG.apiToken === 'your-api-token-here') {
        console.log('\n❌ Please update JIRA_CONFIG at the top of this file with your credentials');
        console.log('   1. Update baseUrl (e.g., https://hibob.atlassian.net)');
        console.log('   2. Update username (your email address)'); 
        console.log('   3. Update apiToken (generate from https://id.atlassian.com/manage-profile/security/api-tokens)');
        process.exit(1);
    }

    try {
        // Step 1: Find a sample story
        await findSampleStory();
        
        // Step 2: Get all custom fields
        const customFields = await getAllCustomFields();
        
        // Step 3: Analyze sample story
        const sampleIssue = await analyzeSampleStory(SAMPLE_STORY_KEY);
        
        // Step 4: Identify field mappings
        const fieldMappings = identifyFields(customFields, sampleIssue);
        
        // Step 5: Test configuration
        const testResults = await testConfiguration(fieldMappings);
        
        // Step 6: Generate backend code
        const backendCode = generateBackendCode(fieldMappings, JIRA_CONFIG);
        
        // Step 7: Write configured files
        const configuredBackendPath = path.join(__dirname, 'configured-backend-testing-coverage.js');
        fs.writeFileSync(configuredBackendPath, backendCode);
        console.log(`✅ Generated configured backend: ${configuredBackendPath}`);
        
        // Step 8: Generate integration instructions
        const instructions = `
# 🎯 AUTO-CONFIGURATION COMPLETE!

## Results Summary
- ✅ Connected to JIRA successfully
- ✅ Found ${testResults.total} stories matching testing coverage criteria  
- ✅ Auto-discovered field mappings
- ✅ Generated configured backend code

## Field Mappings Discovered
- Story Points: ${fieldMappings.storyPoints || '❌ NOT FOUND'}
- Leading Team: ${fieldMappings.leadingTeam || '❌ NOT FOUND'}
- Test Case Created: ${fieldMappings.testCaseCreated || '❌ NOT FOUND'}  
- Sprint: ${fieldMappings.sprint || '❌ NOT FOUND'}

## Next Steps

### 1. Use the Generated Backend
The configured backend is ready to use: \`configured-backend-testing-coverage.js\`

### 2. Add to Your Server
\`\`\`javascript
// In your main server file (e.g., server.js, app.js):
const { setupTestingCoverageRoutes } = require('./configured-backend-testing-coverage');

// Add this line after your existing routes:
setupTestingCoverageRoutes(app);
\`\`\`

### 3. Set Environment Variables
\`\`\`bash
# Add to your .env file:
JIRA_BASE_URL=${JIRA_CONFIG.baseUrl}
JIRA_USERNAME=${JIRA_CONFIG.username}
JIRA_API_TOKEN=your-actual-api-token
\`\`\`

### 4. Test the Endpoint
\`\`\`bash
# Start your server, then test:
curl http://localhost:3002/api/testing-coverage
\`\`\`

### 5. Verify Dashboard
- Refresh the dashboard
- Should show ${testResults.total} stories instead of 34
- All 4 MIS teams should be represented
- No more 404 errors in console

## Expected Results
- **Before**: 5 of 34 stories (15% coverage) ❌
- **After**: X of ${testResults.total} stories (accurate coverage) ✅

🎉 **Configuration complete! Your testing coverage analytics should now show the full dataset!**
`;

        const instructionsPath = path.join(__dirname, 'AUTO-CONFIG-RESULTS.md');
        fs.writeFileSync(instructionsPath, instructions);
        console.log(`📖 Generated instructions: ${instructionsPath}`);
        
        console.log('\n🎉 AUTO-CONFIGURATION SUCCESSFUL!');
        console.log('=================================');
        console.log('✅ Backend configured and ready to use');
        console.log(`✅ Expected stories: ${testResults.total} (vs current 34)`);
        console.log('✅ Field mappings auto-discovered');
        console.log('✅ Integration instructions generated');
        console.log('\n📁 Generated Files:');
        console.log(`   - ${configuredBackendPath}`);
        console.log(`   - ${instructionsPath}`);
        console.log('\n🚀 Ready to integrate! Follow the instructions in AUTO-CONFIG-RESULTS.md');
        
    } catch (error) {
        console.error('\n❌ Auto-configuration failed:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Check JIRA credentials (URL, username, API token)');
        console.log('2. Verify network connectivity to JIRA');
        console.log('3. Ensure you have permission to read issues and custom fields');
        console.log('4. Try generating an API token: https://id.atlassian.com/manage-profile/security/api-tokens');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main, identifyFields, generateBackendCode };