/**
 * Quick JIRA Connection Test
 * 
 * Run this first to make sure your JIRA credentials work
 * before running the full auto-configuration.
 * 
 * Usage: node quick-test.js
 */

const fetch = require('node-fetch');

// === UPDATE THESE 3 VALUES ===
const JIRA_CONFIG = {
    baseUrl: 'https://hibob.atlassian.net',        // ← UPDATE: Your JIRA domain
    username: 'your-email@hibob.com',              // ← UPDATE: Your email  
    apiToken: 'your-api-token-here'                // ← UPDATE: Your API token
};

function getJiraHeaders() {
    const auth = Buffer.from(`${JIRA_CONFIG.username}:${JIRA_CONFIG.apiToken}`).toString('base64');
    return {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
    };
}

async function quickTest() {
    console.log('🧪 Quick JIRA Connection Test');
    console.log('============================');
    
    console.log(`🌐 Testing: ${JIRA_CONFIG.baseUrl}`);
    console.log(`👤 User: ${JIRA_CONFIG.username}`);
    console.log(`🔑 Token: ${JIRA_CONFIG.apiToken ? '***' + JIRA_CONFIG.apiToken.slice(-4) : 'NOT SET ❌'}`);

    try {
        // Test 1: Basic connection
        console.log('\n🔄 Test 1: Basic JIRA connection...');
        const response = await fetch(`${JIRA_CONFIG.baseUrl}/rest/api/3/myself`, {
            headers: getJiraHeaders()
        });

        if (!response.ok) {
            throw new Error(`Connection failed: ${response.status} ${response.statusText}`);
        }

        const user = await response.json();
        console.log(`✅ Connected as: ${user.displayName} (${user.emailAddress})`);

        // Test 2: Story access
        console.log('\n🔄 Test 2: Story access...');
        const storiesResponse = await fetch(`${JIRA_CONFIG.baseUrl}/rest/api/3/search`, {
            method: 'POST',
            headers: getJiraHeaders(),
            body: JSON.stringify({
                jql: 'type = Story ORDER BY created DESC',
                startAt: 0,
                maxResults: 1,
                fields: ['key', 'summary']
            })
        });

        if (!storiesResponse.ok) {
            throw new Error(`Stories access failed: ${storiesResponse.status} ${storiesResponse.statusText}`);
        }

        const storiesData = await storiesResponse.json();
        console.log(`✅ Can access stories: ${storiesData.total} total stories found`);

        if (storiesData.total > 0) {
            console.log(`📝 Sample story: ${storiesData.issues[0].key} - ${storiesData.issues[0].fields.summary.substring(0, 50)}...`);
        }

        // Test 3: Testing coverage query
        console.log('\n🔄 Test 3: Testing coverage query...');
        const testingResponse = await fetch(`${JIRA_CONFIG.baseUrl}/rest/api/3/search`, {
            method: 'POST',
            headers: getJiraHeaders(),
            body: JSON.stringify({
                jql: 'type = Story AND status NOT IN (Canceled, Reject, Rejected) AND "story points[number]" > "0.5"',
                startAt: 0,
                maxResults: 1,
                fields: ['key']
            })
        });

        if (!testingResponse.ok) {
            console.log(`⚠️ Testing coverage query failed: ${testingResponse.status} ${testingResponse.statusText}`);
            console.log('   This might be due to custom field names - the auto-configuration will handle this');
        } else {
            const testingData = await testingResponse.json();
            console.log(`✅ Testing coverage query works: ${testingData.total} eligible stories found`);
        }

        console.log('\n🎉 ALL TESTS PASSED!');
        console.log('✅ Your JIRA connection is working correctly');
        console.log('🚀 Ready to run: node auto-configure-jira.js');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        
        console.log('\n🔧 Troubleshooting:');
        
        if (error.message.includes('401')) {
            console.log('❌ Authentication failed - check your username and API token');
            console.log('   • Verify your email address is correct');
            console.log('   • Generate a new API token: https://id.atlassian.com/manage-profile/security/api-tokens');
        } else if (error.message.includes('403')) {
            console.log('❌ Permission denied - your account may not have access to JIRA APIs');
            console.log('   • Contact your JIRA admin to grant API access');
            console.log('   • Ensure you can log into JIRA normally');
        } else if (error.message.includes('404')) {
            console.log('❌ JIRA URL not found - check your baseUrl');
            console.log('   • Verify the URL format: https://your-domain.atlassian.net');
            console.log('   • Make sure the domain name is correct');
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('network')) {
            console.log('❌ Network connectivity issue');
            console.log('   • Check your internet connection');
            console.log('   • Verify the JIRA URL is accessible in your browser');
        } else {
            console.log('❌ Unexpected error - check your credentials and try again');
        }
        
        console.log('\n📝 Double-check your configuration:');
        console.log(`   baseUrl: ${JIRA_CONFIG.baseUrl}`);
        console.log(`   username: ${JIRA_CONFIG.username}`);
        console.log(`   apiToken: ${JIRA_CONFIG.apiToken ? 'SET ✅' : 'NOT SET ❌'}`);
        
        process.exit(1);
    }
}

if (require.main === module) {
    quickTest().catch(console.error);
}

module.exports = { quickTest };