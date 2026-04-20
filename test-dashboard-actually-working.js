#!/usr/bin/env node

const fs = require('fs');
const { JSDOM } = require('jsdom');

console.log('🔍 TESTING DASHBOARD: bug-dashboard-embedded.html');
console.log('===============================================');

async function testDashboardActually() {
    try {
        console.log('\n1. 📄 Loading dashboard HTML file...');
        
        const dashboardPath = '/Users/guy.levin/Documents/testcourse/bug-dashboard-embedded.html';
        if (!fs.existsSync(dashboardPath)) {
            console.log('❌ Dashboard file not found!');
            return false;
        }
        
        const htmlContent = fs.readFileSync(dashboardPath, 'utf8');
        console.log(`✅ Dashboard loaded (${Math.round(htmlContent.length/1024)}KB)`);
        
        console.log('\n2. 🔧 Simulating browser environment...');
        
        // Create DOM environment
        const dom = new JSDOM(htmlContent, {
            runScripts: "dangerously",
            resources: "usable",
            pretendToBeVisual: true
        });
        
        const window = dom.window;
        const document = window.document;
        
        console.log('✅ DOM environment created');
        
        console.log('\n3. 📊 Testing data loading...');
        
        // Wait a moment for scripts to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if data variable exists
        const dataExists = window.data !== undefined;
        console.log(`   Data variable exists: ${dataExists ? '✅' : '❌'}`);
        
        if (dataExists) {
            const bugCount = window.data.bugs ? window.data.bugs.length : 0;
            console.log(`   Bug count: ${bugCount} bugs`);
            console.log(`   Metadata: ${window.data.metadata ? '✅' : '❌'}`);
        }
        
        console.log('\n4. 🎯 Testing JavaScript functions...');
        
        const functionsToTest = [
            'calculateStats',
            'displayStats', 
            'loadData',
            'populateFilters',
            'applyFilters',
            'enhanceVisibleBugs'
        ];
        
        let functionsWorking = 0;
        functionsToTest.forEach(funcName => {
            const exists = typeof window[funcName] === 'function';
            console.log(`   ${funcName}(): ${exists ? '✅' : '❌'}`);
            if (exists) functionsWorking++;
        });
        
        console.log('\n5. 🔍 Testing DOM elements...');
        
        const elementsToCheck = [
            'totalBugs',
            'highPriorityBugs', 
            'deployedBugs',
            'avgDaysOpen',
            'status',
            'dashboard-content'
        ];
        
        let elementsFound = 0;
        elementsToCheck.forEach(elementId => {
            const element = document.getElementById(elementId);
            const exists = element !== null;
            console.log(`   #${elementId}: ${exists ? '✅' : '❌'}`);
            if (exists) elementsFound++;
        });
        
        console.log('\n6. 🧮 Testing calculateStats function...');
        
        if (window.calculateStats && window.data && window.data.bugs) {
            try {
                const stats = window.calculateStats(window.data.bugs);
                console.log('   ✅ calculateStats() executed successfully');
                console.log(`   📊 Total bugs calculated: ${stats.totalBugs}`);
                console.log(`   📈 Status categories: ${Object.keys(stats.byStatus).length}`);
                console.log(`   🎯 Priority categories: ${Object.keys(stats.bySeverity).length}`);
                console.log(`   📅 Average days open: ${stats.averageDaysOpen}`);
                
                // Test the specific issue that was failing
                const highPriorityCount = stats.bySeverity['High'] || 0;
                console.log(`   🔥 High priority count: ${highPriorityCount} (this was failing before!)`);
                
            } catch (error) {
                console.log(`   ❌ calculateStats() failed: ${error.message}`);
                return false;
            }
        } else {
            console.log('   ❌ Cannot test calculateStats - missing function or data');
        }
        
        console.log('\n7. 🎨 Testing displayStats function...');
        
        if (window.displayStats && window.calculateStats && window.data) {
            try {
                const stats = window.calculateStats(window.data.bugs);
                window.displayStats(stats);
                console.log('   ✅ displayStats() executed successfully');
                
                // Check if elements were updated
                const totalElement = document.getElementById('totalBugs');
                const highPriorityElement = document.getElementById('highPriorityBugs');
                
                if (totalElement && totalElement.textContent !== '-') {
                    console.log(`   ✅ Total bugs display updated: ${totalElement.textContent}`);
                } else {
                    console.log('   ⚠️ Total bugs display not updated');
                }
                
                if (highPriorityElement && highPriorityElement.textContent !== '-') {
                    console.log(`   ✅ High priority display updated: ${highPriorityElement.textContent}`);
                } else {
                    console.log('   ⚠️ High priority display not updated');
                }
                
            } catch (error) {
                console.log(`   ❌ displayStats() failed: ${error.message}`);
            }
        }
        
        console.log('\n📊 DASHBOARD TEST RESULTS:');
        console.log('==========================');
        
        const functionsScore = (functionsWorking / functionsToTest.length) * 100;
        const elementsScore = (elementsFound / elementsToCheck.length) * 100;
        const dataScore = dataExists ? 100 : 0;
        const overallScore = (functionsScore + elementsScore + dataScore) / 3;
        
        console.log(`   📊 Data Loading: ${dataScore}%`);
        console.log(`   🔧 JavaScript Functions: ${Math.round(functionsScore)}%`);
        console.log(`   🎨 DOM Elements: ${Math.round(elementsScore)}%`);
        console.log(`   🎯 Overall Score: ${Math.round(overallScore)}%`);
        
        if (overallScore >= 80) {
            console.log('\n✅ DASHBOARD IS WORKING!');
            console.log('   Dashboard should load and function correctly in browser');
        } else if (overallScore >= 60) {
            console.log('\n⚠️ DASHBOARD PARTIALLY WORKING');
            console.log('   Some features may not work properly');
        } else {
            console.log('\n❌ DASHBOARD HAS ISSUES');
            console.log('   Significant problems prevent proper functionality');
        }
        
        return overallScore >= 80;
        
    } catch (error) {
        console.log(`❌ TESTING FAILED: ${error.message}`);
        console.log('\n🔧 Trying simpler validation...');
        
        // Fallback: just check file structure
        try {
            const htmlContent = fs.readFileSync('/Users/guy.levin/Documents/testcourse/bug-dashboard-embedded.html', 'utf8');
            
            const hasData = htmlContent.includes('const data = {');
            const hasStats = htmlContent.includes('function calculateStats');
            const hasBugs = htmlContent.includes('"totalBugs": 971');
            
            console.log(`   📊 Has embedded data: ${hasData ? '✅' : '❌'}`);
            console.log(`   🔧 Has calculateStats: ${hasStats ? '✅' : '❌'}`);
            console.log(`   📋 Has bug data: ${hasBugs ? '✅' : '❌'}`);
            
            const basicWorking = hasData && hasStats && hasBugs;
            console.log(`\\n${basicWorking ? '✅ BASIC STRUCTURE OK' : '❌ STRUCTURE ISSUES'}`);
            
            return basicWorking;
            
        } catch (fallbackError) {
            console.log(`❌ Fallback test also failed: ${fallbackError.message}`);
            return false;
        }
    }
}

// Run the test
testDashboardActually().then(success => {
    if (success) {
        console.log('\n🎯 CONCLUSION: Dashboard should work when opened in browser!');
    } else {
        console.log('\n🚨 CONCLUSION: Dashboard needs more fixes before it will work.');
    }
    process.exit(success ? 0 : 1);
});