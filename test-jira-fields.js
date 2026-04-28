/**
 * JIRA Field Mapping Test Script
 * 
 * Run this script to validate your JIRA custom field mappings
 * before integrating the full backend solution.
 * 
 * Usage: 
 *   1. Update JIRA_CONFIG with your credentials
 *   2. Update FIELD_IDS with your custom field IDs  
 *   3. Run: node test-jira-fields.js
 */

const fetch = require('node-fetch');

// === CONFIGURATION ===
const JIRA_CONFIG = {
    baseUrl: 'https://your-domain.atlassian.net', // UPDATE THIS
    username: 'your-email@company.com',           // UPDATE THIS
    apiToken: 'your-api-token'                    // UPDATE THIS
};

// UPDATE THESE FIELD IDs BASED ON YOUR JIRA INSTANCE:
const FIELD_IDS = {
    storyPoints: 'customfield_10020',        // Story Points field
    leadingTeam: 'customfield_10021',        // Leading Team dropdown
    testCaseCreated: 'customfield_10022',    // Test Case Created checkbox
    sprint: 'customfield_10023'              // Sprint field
};

// Test issue key - use any story from your system
const TEST_ISSUE_KEY = 'BT-12345'; // UPDATE THIS

// === UTILITY FUNCTIONS ===

function getJiraHeaders() {
    const auth = Buffer.from(`${JIRA_CONFIG.username}:${JIRA_CONFIG.apiToken}`).toString('base64');
    return {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
}

async function testSingleIssue(issueKey) {
    const url = `${JIRA_CONFIG.baseUrl}/rest/api/3/issue/${issueKey}`;
    
    console.log(`🔍 Testing field mappings with issue: ${issueKey}`);
    console.log(`📍 URL: ${url}`);
    
    try {
        const response = await fetch(url, {
            headers: getJiraHeaders()
        });

        if (!response.ok) {
            throw new Error(`JIRA API error: ${response.status} ${response.statusText}`);
        }

        const issue = await response.json();
        return issue;
        
    } catch (error) {
        console.error('❌ Failed to fetch test issue:', error.message);
        throw error;
    }
}

async function testJqlQuery() {
    const jql = `
        type = Story
        AND status NOT IN (Canceled, Reject, Rejected)
        AND "leading team[dropdown]" IN ("MIS - GTM", "MIS - GTC", "MIS - CORP", "MIS - Platform")
        AND "story points[number]" > "0.5"
        ORDER BY created DESC
    `.trim().replace(/\s+/g, ' ');

    const url = `${JIRA_CONFIG.baseUrl}/rest/api/3/search`;
    
    const requestBody = {
        jql: jql,
        startAt: 0,
        maxResults: 5, // Just get a few for testing
        fields: [
            'key', 'summary', 'status',
            FIELD_IDS.storyPoints,
            FIELD_IDS.leadingTeam, 
            FIELD_IDS.testCaseCreated,
            FIELD_IDS.sprint
        ]
    };

    console.log(`\n🔍 Testing JQL query:`);
    console.log(`📍 JQL: ${jql}`);
    
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
        console.log(`✅ JQL query successful: ${data.total} total stories found`);
        console.log(`📦 Retrieved ${data.issues.length} sample stories`);
        
        return data;
        
    } catch (error) {
        console.error('❌ JQL query failed:', error.message);
        throw error;
    }
}

function analyzeFields(issue) {
    console.log(`\n📊 Field Analysis for ${issue.key}:`);
    console.log(`📝 Summary: ${issue.fields.summary}`);
    console.log(`📊 Status: ${issue.fields.status.name}`);
    
    // Test Story Points
    const storyPoints = issue.fields[FIELD_IDS.storyPoints];
    console.log(`📈 Story Points (${FIELD_IDS.storyPoints}):`, storyPoints);
    console.log(`   Type: ${typeof storyPoints}`);
    console.log(`   Value: ${JSON.stringify(storyPoints)}`);
    console.log(`   ≥0.5?: ${parseFloat(storyPoints || 0) >= 0.5 ? '✅' : '❌'}`);
    
    // Test Leading Team
    const leadingTeam = issue.fields[FIELD_IDS.leadingTeam];
    console.log(`👥 Leading Team (${FIELD_IDS.leadingTeam}):`, leadingTeam);
    console.log(`   Type: ${typeof leadingTeam}`);
    console.log(`   Value: ${JSON.stringify(leadingTeam)}`);
    const teamValue = leadingTeam?.value || leadingTeam;
    const validTeams = ['MIS - GTM', 'MIS - GTC', 'MIS - CORP', 'MIS - Platform'];
    console.log(`   Valid Team?: ${validTeams.includes(teamValue) ? '✅' : '❌'} (${teamValue})`);
    
    // Test Test Case Created
    const testCaseCreated = issue.fields[FIELD_IDS.testCaseCreated];
    console.log(`✅ Test Case Created (${FIELD_IDS.testCaseCreated}):`, testCaseCreated);
    console.log(`   Type: ${typeof testCaseCreated}`);
    console.log(`   Value: ${JSON.stringify(testCaseCreated)}`);
    
    // Transform value
    let transformed = 'No';
    if (testCaseCreated) {
        if (Array.isArray(testCaseCreated)) {
            transformed = testCaseCreated.includes('Yes') ? 'Yes' : 'No';
        } else if (typeof testCaseCreated === 'object') {
            const value = testCaseCreated.value || testCaseCreated;
            transformed = Array.isArray(value) ? 
                (value.includes('Yes') ? 'Yes' : 'No') :
                (value === 'Yes' ? 'Yes' : 'No');
        } else {
            transformed = testCaseCreated === 'Yes' ? 'Yes' : 'No';
        }
    }
    console.log(`   Transformed: "${transformed}"`);
    
    // Test Sprint
    const sprint = issue.fields[FIELD_IDS.sprint];
    console.log(`🏃 Sprint (${FIELD_IDS.sprint}):`, sprint);
    console.log(`   Type: ${typeof sprint}`);
    console.log(`   Value: ${JSON.stringify(sprint)}`);
    const sprintName = sprint?.[0]?.name || null;
    console.log(`   Sprint Name: ${sprintName || 'No sprint'}`);
    
    return {
        storyPoints: parseFloat(storyPoints || 0),
        leadingTeam: teamValue,
        testCaseCreated: transformed,
        sprint: sprintName,
        isEligible: parseFloat(storyPoints || 0) >= 0.5 && validTeams.includes(teamValue)
    };
}

async function main() {
    console.log('🧪 JIRA Field Mapping Test Script');
    console.log('=================================');
    
    console.log('\n📋 Configuration:');
    console.log(`🌐 JIRA URL: ${JIRA_CONFIG.baseUrl}`);
    console.log(`👤 Username: ${JIRA_CONFIG.username}`);
    console.log(`🔑 API Token: ${JIRA_CONFIG.apiToken ? '***' + JIRA_CONFIG.apiToken.slice(-4) : 'NOT SET'}`);
    
    console.log('\n🏷️  Field IDs to test:');
    console.log(`📈 Story Points: ${FIELD_IDS.storyPoints}`);
    console.log(`👥 Leading Team: ${FIELD_IDS.leadingTeam}`);
    console.log(`✅ Test Case Created: ${FIELD_IDS.testCaseCreated}`);
    console.log(`🏃 Sprint: ${FIELD_IDS.sprint}`);
    
    try {
        // Test 1: Single issue field mapping
        console.log('\n' + '='.repeat(50));
        console.log('TEST 1: Single Issue Field Mapping');
        console.log('='.repeat(50));
        
        const testIssue = await testSingleIssue(TEST_ISSUE_KEY);
        const analysis = analyzeFields(testIssue);
        
        console.log(`\n📊 Summary for ${TEST_ISSUE_KEY}:`);
        console.log(`   Story Points: ${analysis.storyPoints}`);
        console.log(`   Leading Team: ${analysis.leadingTeam}`);
        console.log(`   Test Case Created: ${analysis.testCaseCreated}`);
        console.log(`   Sprint: ${analysis.sprint}`);
        console.log(`   Eligible for Testing Coverage: ${analysis.isEligible ? '✅ YES' : '❌ NO'}`);
        
        // Test 2: JQL query
        console.log('\n' + '='.repeat(50));
        console.log('TEST 2: JQL Query Results');
        console.log('='.repeat(50));
        
        const queryResults = await testJqlQuery();
        
        if (queryResults.issues.length > 0) {
            console.log(`\n📊 Sample stories from JQL query:`);
            
            queryResults.issues.forEach((issue, index) => {
                console.log(`\n${index + 1}. ${issue.key}`);
                const analysis = analyzeFields(issue);
                console.log(`   → ${analysis.storyPoints}pts | ${analysis.leadingTeam} | ${analysis.testCaseCreated} | ${analysis.isEligible ? '✅' : '❌'}`);
            });
            
            const eligibleCount = queryResults.issues.filter(issue => {
                const storyPoints = parseFloat(issue.fields[FIELD_IDS.storyPoints] || 0);
                const teamValue = issue.fields[FIELD_IDS.leadingTeam]?.value || issue.fields[FIELD_IDS.leadingTeam];
                const validTeams = ['MIS - GTM', 'MIS - GTC', 'MIS - CORP', 'MIS - Platform'];
                return storyPoints >= 0.5 && validTeams.includes(teamValue);
            }).length;
            
            console.log(`\n📊 JQL Results Summary:`);
            console.log(`   Total stories found: ${queryResults.total}`);
            console.log(`   Sample size: ${queryResults.issues.length}`);
            console.log(`   Eligible in sample: ${eligibleCount}/${queryResults.issues.length}`);
        }
        
        // Final assessment
        console.log('\n' + '='.repeat(50));
        console.log('FINAL ASSESSMENT');
        console.log('='.repeat(50));
        
        if (queryResults.total >= 500) {
            console.log('✅ EXCELLENT: Found 500+ stories - this should give you ~594 expected stories');
        } else if (queryResults.total >= 100) {
            console.log('⚠️  MODERATE: Found 100+ stories - may need to adjust filtering criteria');
        } else {
            console.log('❌ LOW: Found <100 stories - check field mappings and JQL query');
        }
        
        console.log(`\n🎯 Expected Dashboard Result:`);
        console.log(`   Before: 5 of 34 stories (15% coverage)`);
        console.log(`   After:  X of ${queryResults.total} stories (Y% coverage)`);
        
        console.log('\n✅ Testing complete! Ready to integrate backend solution.');
        
    } catch (error) {
        console.error('\n❌ Testing failed:', error.message);
        
        console.log('\n🔧 Troubleshooting suggestions:');
        console.log('1. Check JIRA credentials (URL, username, API token)');
        console.log('2. Verify test issue key exists and you have access');
        console.log('3. Confirm custom field IDs are correct for your JIRA instance');
        console.log('4. Check network connectivity to JIRA');
        
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testSingleIssue, testJqlQuery, analyzeFields };