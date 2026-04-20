// Test script for full Production bug integration (all 971 bugs)

const fs = require('fs');
const path = require('path');

function testFullIntegration() {
    console.log('🧪 Testing Full Production Bug Integration...\n');
    
    try {
        // Load the current bug data
        const dataPath = path.join(__dirname, 'jira-bugs-data.json');
        if (!fs.existsSync(dataPath)) {
            console.log('❌ No jira-bugs-data.json found. Run export-jira-data.js first.');
            return;
        }
        
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        
        console.log('📊 Integration Readiness Check:');
        console.log(`   Total Production bugs: ${data.bugs.length}`);
        console.log(`   Expected: 971 bugs`);
        
        if (data.bugs.length === 971) {
            console.log('   ✅ Perfect! Ready for full integration');
        } else {
            console.log('   ⚠️  Unexpected bug count - re-export may be needed');
        }
        
        // Sample the data to show variety of bugs
        console.log('\n📋 Sample bugs for integration:');
        const samples = [0, 100, 200, 500, 970]; // Sample from different parts of the dataset
        
        samples.forEach((index, i) => {
            if (index < data.bugs.length) {
                const bug = data.bugs[index];
                console.log(`   ${i + 1}. ${bug.key}: ${bug.summary.substring(0, 50)}...`);
                console.log(`      Status: ${bug.status} | Priority: ${bug.priority} | Assignee: ${bug.assignee}`);
            }
        });
        
        // Check for bugs that might need sprint data updates
        const bugsWithoutSprint = data.bugs.filter(bug => !bug.sprint || bug.sprint === 'None').length;
        const bugsWithoutLeadingTeam = data.bugs.filter(bug => !bug.leadingTeam).length;
        const bugsWithoutSystem = data.bugs.filter(bug => !bug.system).length;
        
        console.log('\n🔍 Data completeness analysis:');
        console.log(`   Bugs without sprint data: ${bugsWithoutSprint}`);
        console.log(`   Bugs without leading team: ${bugsWithoutLeadingTeam}`);
        console.log(`   Bugs without system: ${bugsWithoutSystem}`);
        
        const totalIncomplete = bugsWithoutSprint + bugsWithoutLeadingTeam + bugsWithoutSystem;
        console.log(`   Total fields to enhance: ${totalIncomplete}`);
        
        if (totalIncomplete > 0) {
            console.log('   ✅ Good candidate for real-time integration enhancement!');
        } else {
            console.log('   ℹ️  Data looks complete, but integration will ensure freshness');
        }
        
        console.log('\n🚀 Integration Batch Estimates:');
        const batchSize = 10;
        const totalBatches = Math.ceil(data.bugs.length / batchSize);
        const estimatedTimePerBatch = 5; // seconds
        const estimatedTotalTime = totalBatches * estimatedTimePerBatch;
        
        console.log(`   Batch size: ${batchSize} bugs per batch`);
        console.log(`   Total batches: ${totalBatches}`);
        console.log(`   Estimated time: ~${Math.round(estimatedTotalTime / 60)} minutes`);
        
        console.log('\n💡 Next Steps:');
        console.log('   1. Start the Jira proxy: node jira-proxy.js');
        console.log('   2. Open hibob-bug-dashboard.html in browser');
        console.log('   3. Watch the console for real-time integration progress');
        console.log('   4. All 971 Production bugs will be enhanced with live data!');
        
    } catch (error) {
        console.error('❌ Error testing integration setup:', error.message);
    }
}

if (require.main === module) {
    testFullIntegration();
}

module.exports = { testFullIntegration };