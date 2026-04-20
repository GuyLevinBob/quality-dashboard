// Quick test for JIRA API connectivity
async function testJiraConnection() {
    console.log('🧪 Testing JIRA API connection...');
    
    const jiraConfig = {
        baseUrl: 'https://hibob.atlassian.net',
        email: 'guy.levin@hibob.io',
        token: 'ATATT3xFfGF0B9XbLpONas1I4ajySGn_mOUcj6U-7ckO2iSLB-xW2ma7Mb4WjaB_tHU7Qy7sXLHo_9-3pS5eaa6iLhkbscZJUiK_vZcxOTZ5KvHwg2ZWpFgnSTEK7N-0f5dw6a-EFShJKpMYUGmXcyxZERKXsdojohHsxXsDcWCiNqu-iVlJ5n8=FC8BCCBF'
    };
    
    try {
        // Test with a simple issue - BT-737 that we know exists
        const testIssue = 'BT-737';
        console.log(`📡 Testing API call to ${testIssue}...`);
        
        const response = await fetch(`${jiraConfig.baseUrl}/rest/api/2/issue/${testIssue}`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${btoa(`${jiraConfig.email}:${jiraConfig.token}`)}`,
                'Accept': 'application/json'
            }
        });
        
        console.log(`📊 Response status: ${response.status}`);
        
        if (response.ok) {
            const data = await response.json();
            console.log(`✅ SUCCESS! Retrieved ${testIssue}:`, {
                summary: data.fields.summary,
                status: data.fields.status.name,
                hasChangelog: !!data.changelog
            });
            return true;
        } else {
            const errorText = await response.text();
            console.error(`❌ API Error ${response.status}:`, errorText);
            return false;
        }
        
    } catch (error) {
        console.error('❌ Connection failed:', error);
        console.log('💡 This might be a CORS issue - try opening dashboard from a web server');
        return false;
    }
}

// Auto-run test when script loads
if (typeof window !== 'undefined') {
    // Run in browser
    testJiraConnection();
}