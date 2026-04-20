// Test script to catch dashboard JavaScript errors
const fs = require('fs');

console.log('🧪 TESTING DASHBOARD FOR RUNTIME ERRORS');
console.log('=====================================');

// Mock DOM environment
global.document = {
    getElementById: (id) => {
        console.log(`🔍 Looking for element: ${id}`);
        return {
            textContent: '',
            innerHTML: '',
            value: '',
            style: { display: 'block' },
            addEventListener: () => {},
            classList: { add: () => {}, remove: () => {}, contains: () => false },
            querySelector: () => null,
            appendChild: () => {}
        };
    },
    querySelectorAll: () => [],
    createElement: () => ({ 
        appendChild: () => {}, 
        innerHTML: '', 
        className: '', 
        querySelector: () => null,
        addEventListener: () => {}
    }),
    addEventListener: () => {}
};

global.window = {};
global.console = console;
global.performance = { now: () => Date.now() };
global.setTimeout = setTimeout;
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });

try {
    console.log('1. 📋 Loading external dependencies...');
    
    // Load field mappings
    const fieldMappings = fs.readFileSync('jira-field-mappings.js', 'utf8');
    eval(fieldMappings);
    console.log('   ✅ jira-field-mappings.js loaded');
    
    // Load JIRA integration
    const jiraIntegration = fs.readFileSync('jira-api-integration-proxy.js', 'utf8');
    eval(jiraIntegration);
    console.log('   ✅ jira-api-integration-proxy.js loaded');
    
    console.log('\n2. 🔍 Checking available functions...');
    console.log('   initializeJiraIntegrationProxy:', typeof initializeJiraIntegrationProxy);
    console.log('   JIRA_FIELD_MAPPINGS:', typeof JIRA_FIELD_MAPPINGS);
    
    console.log('\n3. 📊 Loading dashboard HTML...');
    const html = fs.readFileSync('bug-dashboard-embedded.html', 'utf8');
    
    // Extract and test just the JavaScript portions
    const scriptMatches = html.match(/<script[^>]*>([^<]+(?:(?!<\/script>)<[^<]*)*)<\/script>/g);
    
    if (scriptMatches && scriptMatches.length > 0) {
        // Find the main script (not external src)
        const mainScript = scriptMatches.find(script => 
            !script.includes('src=') && script.includes('const data =')
        );
        
        if (mainScript) {
            console.log('\n4. 🧪 Testing main dashboard script...');
            const jsCode = mainScript.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
            
            try {
                eval(jsCode);
                console.log('   ✅ Main script executed without errors');
                
                // Test key functions
                console.log('\n5. 🔧 Testing key functions...');
                if (typeof initializeApp === 'function') {
                    console.log('   ✅ initializeApp function available');
                } else {
                    console.log('   ❌ initializeApp function missing');
                }
                
                if (typeof populateFilters === 'function') {
                    console.log('   ✅ populateFilters function available');
                } else {
                    console.log('   ❌ populateFilters function missing');
                }
                
            } catch (scriptError) {
                console.log(`   ❌ Script execution error: ${scriptError.message}`);
                console.log(`   📍 Error line area: ${scriptError.stack?.split('\n')[1] || 'unknown'}`);
            }
        } else {
            console.log('   ❌ Could not find main dashboard script');
        }
    } else {
        console.log('   ❌ No script blocks found');
    }
    
    console.log('\n🎯 TEST SUMMARY:');
    console.log('If no errors above, dashboard should load properly.');
    
} catch (error) {
    console.log(`❌ CRITICAL ERROR: ${error.message}`);
    console.log(error.stack);
}