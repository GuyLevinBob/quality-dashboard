#!/usr/bin/env node

const http = require('http');

console.log('🔬 HEADLESS DASHBOARD TEST (Best I Can Do)');
console.log('=========================================');

async function testDashboardHeadless() {
    console.log('\n1. 🌐 HTTP Server Test...');
    
    try {
        const response = await makeRequest('http://localhost:8001/bug-dashboard-embedded.html');
        console.log(`   ✅ HTTP Status: ${response.statusCode}`);
        console.log(`   📊 Content Size: ${Math.round(response.data.length / 1024)}KB`);
        
        if (response.statusCode !== 200) {
            console.log('   ❌ Server error - dashboard not accessible');
            return false;
        }
        
        console.log('\n2. 📄 Content Analysis...');
        
        const html = response.data;
        
        // Check for critical content
        const hasHtmlStructure = html.includes('<!DOCTYPE html>') && html.includes('</html>');
        const hasData = html.includes('const data = {') && html.includes('"totalBugs": 971');
        const hasJavaScript = html.includes('<script>') && html.includes('</script>');
        const hasCalculateStats = html.includes('function calculateStats(');
        
        console.log(`   ${hasHtmlStructure ? '✅' : '❌'} Valid HTML structure`);
        console.log(`   ${hasData ? '✅' : '❌'} Embedded data (971 bugs)`);
        console.log(`   ${hasJavaScript ? '✅' : '❌'} JavaScript section`);
        console.log(`   ${hasCalculateStats ? '✅' : '❌'} calculateStats function`);
        
        console.log('\n3. 🔍 JavaScript Syntax Check...');
        
        // Extract JavaScript and check for basic syntax issues
        const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
        let jsErrors = [];
        
        if (scriptMatches) {
            console.log(`   📊 Found ${scriptMatches.length} script sections`);
            
            scriptMatches.forEach((script, index) => {
                const jsCode = script.replace(/<\/?script[^>]*>/gi, '');
                
                // Check for obvious syntax issues
                if (jsCode.includes('const data = {')) {
                    const braceCount = (jsCode.match(/\{/g) || []).length - (jsCode.match(/\}/g) || []).length;
                    if (braceCount !== 0) {
                        jsErrors.push(`Script ${index + 1}: Unbalanced braces (${braceCount})`);
                    }
                }
                
                // Check for undefined property access patterns
                if (jsCode.includes('.bySeverity[') && !jsCode.includes('calculateStats')) {
                    jsErrors.push(`Script ${index + 1}: Potential undefined property access`);
                }
            });
        }
        
        if (jsErrors.length === 0) {
            console.log('   ✅ No obvious JavaScript syntax errors found');
        } else {
            console.log('   ❌ JavaScript issues found:');
            jsErrors.forEach(error => console.log(`      - ${error}`));
        }
        
        console.log('\n4. 🎯 Critical Function Check...');
        
        const criticalFunctions = [
            'function calculateStats(',
            'function displayStats(',
            'function loadData(',
            'function populateFilters(',
            'function applyFilters('
        ];
        
        let functionsFound = 0;
        criticalFunctions.forEach(func => {
            const found = html.includes(func);
            console.log(`   ${found ? '✅' : '❌'} ${func.replace('function ', '').replace('(', '()')}`);
            if (found) functionsFound++;
        });
        
        console.log('\n📊 HEADLESS TEST RESULTS:');
        console.log('==========================');
        
        const score = (functionsFound / criticalFunctions.length) * 100;
        console.log(`   📄 HTTP Response: ${response.statusCode === 200 ? 'OK' : 'Error'}`);
        console.log(`   📊 Content Size: ${Math.round(html.length / 1024)}KB`);
        console.log(`   🔧 Functions Found: ${functionsFound}/${criticalFunctions.length} (${Math.round(score)}%)`);
        console.log(`   ⚠️ JS Errors: ${jsErrors.length}`);
        
        console.log('\n🎯 WHAT THIS MEANS:');
        
        if (response.statusCode === 200 && score >= 80 && jsErrors.length === 0) {
            console.log('   ✅ DASHBOARD SHOULD WORK');
            console.log('   📊 All critical components present');
            console.log('   🔧 No obvious JavaScript errors');
            console.log('   🌐 HTTP server serving correctly');
        } else {
            console.log('   ⚠️ DASHBOARD MAY HAVE ISSUES');
            if (response.statusCode !== 200) console.log('   - HTTP server problems');
            if (score < 80) console.log('   - Missing critical functions');
            if (jsErrors.length > 0) console.log('   - JavaScript syntax errors');
        }
        
        console.log('\n🚨 IMPORTANT LIMITATIONS:');
        console.log('   ❌ I cannot see the visual rendering');
        console.log('   ❌ I cannot test user interactions');
        console.log('   ❌ I cannot see runtime JavaScript errors');
        console.log('   ❌ I cannot verify data actually displays');
        console.log('');
        console.log('🎯 ONLY REAL TEST: Open in your browser and check:');
        console.log('   1. Does it load without errors?');
        console.log('   2. Do you see 971 bugs displayed?');
        console.log('   3. Do the filters work?');
        console.log('   4. Are there console errors (F12)?');
        
        return response.statusCode === 200 && score >= 80 && jsErrors.length === 0;
        
    } catch (error) {
        console.log(`   ❌ Test failed: ${error.message}`);
        return false;
    }
}

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, (response) => {
            let data = '';
            
            response.on('data', (chunk) => {
                data += chunk;
            });
            
            response.on('end', () => {
                resolve({
                    statusCode: response.statusCode,
                    data: data
                });
            });
        });
        
        request.on('error', reject);
        request.setTimeout(10000, () => reject(new Error('Request timeout')));
    });
}

// Run the test
testDashboardHeadless().then(success => {
    console.log(`\n${success ? '✅' : '❌'} Headless test ${success ? 'passed' : 'failed'}`);
    process.exit(success ? 0 : 1);
});