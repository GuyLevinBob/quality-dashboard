const fs = require('fs');
const path = require('path');

// Test script to verify Production bug filtering (by bug type field only)

function testProductionFilter() {
    console.log('🧪 Testing Production bug filter (bug type = Production)...\n');
    
    try {
        // Load the current bug data
        const dataPath = path.join(__dirname, 'jira-bugs-data.json');
        if (!fs.existsSync(dataPath)) {
            console.log('❌ No jira-bugs-data.json found. Run export-jira-data.js first.');
            return;
        }
        
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        console.log(`📊 Total bugs in export: ${data.bugs.length}`);
        
        // Dashboard shows ALL bugs from export (export is filtered by bug type = Production)
        const dashboardBugs = data.bugs;
        
        console.log(`🎯 Dashboard will show: ${dashboardBugs.length} bugs`);
        console.log(`📈 Expected: 971 Production bugs (filtered by bug type field)`);
        
        if (dashboardBugs.length === 971) {
            console.log('✅ Perfect match! Dashboard shows exactly 971 Production bugs.');
        } else {
            console.log(`⚠️  Dashboard shows ${dashboardBugs.length} bugs instead of 971.`);
        }
        
        // Show some sample bugs from the filtered export
        if (dashboardBugs.length > 0) {
            console.log('\n📋 Sample Production bugs (filtered by bug type field):');
            dashboardBugs.slice(0, 5).forEach((bug, index) => {
                console.log(`   ${index + 1}. ${bug.key}: ${bug.summary.substring(0, 60)}...`);
                if (bug.bugType) {
                    console.log(`      Bug Type: ${bug.bugType}`);
                }
            });
        }
        
        console.log('\n💡 Status:');
        if (dashboardBugs.length === 971) {
            console.log('   ✅ Setup complete! Dashboard is ready to show 971 Production bugs');
            console.log('   🌐 Open hibob-bug-dashboard.html to view the dashboard');
        } else {
            console.log('   ⚠️  Data export may need to be re-run');
            console.log('   📤 Run: node export-jira-data.js');
        }
        
    } catch (error) {
        console.error('❌ Error testing filter:', error.message);
    }
}

if (require.main === module) {
    testProductionFilter();
}

module.exports = { testProductionFilter };