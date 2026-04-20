// Simple test to verify JIRA integration is working
console.log('🧪 Starting JIRA integration test...');

// Test 1: Check if proxy is reachable
async function testProxyConnection() {
    try {
        console.log('📡 Testing proxy connection...');
        const response = await fetch('http://localhost:3001/api/jira/rest/api/2/issue/BT-737');
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Proxy connection successful!');
            console.log('📊 Sample data:', {
                key: data.key,
                summary: data.fields.summary?.substring(0, 50) + '...',
                status: data.fields.status?.name
            });
            return true;
        } else {
            console.error(`❌ Proxy error: ${response.status} ${response.statusText}`);
            return false;
        }
    } catch (error) {
        console.error('❌ Proxy connection failed:', error.message);
        return false;
    }
}

// Test 2: Check if integration function exists
function testIntegrationFunction() {
    console.log('🔍 Checking integration function...');
    
    if (typeof initializeJiraIntegrationProxy === 'undefined') {
        console.error('❌ initializeJiraIntegrationProxy function not found!');
        return false;
    } else {
        console.log('✅ Integration function found!');
        return true;
    }
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Running integration tests...');
    
    const proxyOk = await testProxyConnection();
    const functionOk = testIntegrationFunction();
    
    if (proxyOk && functionOk) {
        console.log('🎉 All tests passed! Integration should work.');
        
        // Test actual integration with 1 bug
        try {
            const integration = initializeJiraIntegrationProxy();
            const testBug = [{
                key: 'BT-737',
                sprint: 'None',
                leadingTeam: 'No Data',
                system: 'No Data'
            }];
            
            console.log('🔬 Testing with 1 bug...');
            await integration.enhanceBugsWithRealData(testBug, 1);
            console.log('✅ Single bug test completed!');
            
        } catch (error) {
            console.error('❌ Integration test failed:', error);
        }
    } else {
        console.log('❌ Tests failed. Check proxy server and script loading.');
    }
}

// Auto-run tests when script loads
if (typeof window !== 'undefined') {
    runAllTests();
}