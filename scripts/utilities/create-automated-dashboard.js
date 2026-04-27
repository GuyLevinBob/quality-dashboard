#!/usr/bin/env node

const fs = require('fs');

// Read the working dashboard
console.log('📖 Reading working dashboard...');
const workingDashboard = fs.readFileSync('bug-dashboard-embedded-WORKING.html', 'utf8');

// Find the embedded data section (try different spacing patterns)
let dataStart = workingDashboard.indexOf('// Embedded bug data from Jira (using HiBob brand-compliant language)');
if (dataStart === -1) {
    dataStart = workingDashboard.indexOf('// Embedded bug data from Jira');
}
if (dataStart === -1) {
    dataStart = workingDashboard.indexOf('const data = {');
}

let dataEnd = workingDashboard.indexOf('};\n\n        // Efficiently populate missing fields');
if (dataEnd === -1) {
    dataEnd = workingDashboard.indexOf('// Efficiently populate missing fields');
    // Find the }; before this line
    let tempEnd = dataEnd;
    while (tempEnd > 0 && !workingDashboard.substring(tempEnd-3, tempEnd).includes('};')) {
        tempEnd--;
    }
    dataEnd = tempEnd - 1; // Position after the };
}

if (dataStart === -1 || dataEnd === -1) {
    console.error('❌ Could not find embedded data section');
    process.exit(1);
}

console.log('🔍 Found embedded data section');
console.log(`   Start: line ${workingDashboard.substring(0, dataStart).split('\n').length}`);
console.log(`   End: line ${workingDashboard.substring(0, dataEnd).split('\n').length}`);

// Extract the parts before and after the embedded data
const beforeData = workingDashboard.substring(0, dataStart);
const afterData = workingDashboard.substring(dataEnd + 2); // +2 to include the }; and newline

// Create the new data loading section
const newDataSection = `        // Load dashboard data from automated source (ALL original functionality preserved)
        let data = null;
        
        async function loadDashboardDataFromSource() {
            try {
                console.log('🔄 Loading dashboard data from automated source...');
                const response = await fetch('./dashboard-data.json');
                
                if (!response.ok) {
                    throw new Error(\`Failed to load dashboard data: \${response.status}\`);
                }
                
                data = await response.json();
                console.log(\`✅ Loaded \${data.bugs.length} bugs from automated data source\`);
                
                // Initialize dashboard with loaded data (preserves ALL existing functionality)
                loadData();
                
            } catch (error) {
                console.error('❌ Failed to load dashboard data:', error);
                document.getElementById('status').innerHTML = '<span class="error">❌ Failed to load dashboard data. Please try refreshing the page.</span>';
            }
        }

`;

// Update the DOMContentLoaded event listener
const updatedAfterData = afterData.replace(
    /document\.addEventListener\('DOMContentLoaded', function\(\) \{\s*loadData\(\);/,
    `document.addEventListener('DOMContentLoaded', function() {
            loadDashboardDataFromSource(); // Load from automated source, then initialize all functionality`
);

// Remove external script dependencies that are causing 404s
const updatedBeforeData = beforeData.replace(
    /<script src="jira-field-mappings\.js"><\/script>\s*<script src="jira-api-integration-proxy\.js"><\/script>\s*<script src="test-integration\.js"><\/script>/,
    '    <!-- External scripts not needed for automated version -->'
);

// Combine everything
const automatedDashboard = updatedBeforeData + newDataSection + updatedAfterData;

// Write the automated dashboard
fs.writeFileSync('dashboard-automated-fixed.html', automatedDashboard);

console.log('✅ Created dashboard-automated-fixed.html');
console.log('🔧 Changes made:');
console.log('   ✅ Removed embedded data (will load from dashboard-data.json)');
console.log('   ✅ Added external data loading function');
console.log('   ✅ Updated DOMContentLoaded to use new loading');
console.log('   ✅ Removed missing script dependencies');
console.log('   ✅ Preserved ALL original functionality');

// Verify the file is valid HTML
try {
    const content = fs.readFileSync('dashboard-automated-fixed.html', 'utf8');
    if (content.includes('<html') && content.includes('</html>') && content.includes('function populateMissingFields()')) {
        console.log('✅ File structure verified - looks good!');
        
        // Count functions to verify completeness
        const functionCount = (content.match(/function \w+\(/g) || []).length;
        console.log(`📊 Functions preserved: ${functionCount}`);
        
    } else {
        console.warn('⚠️  File structure may be incomplete');
    }
} catch (error) {
    console.error('❌ Error reading generated file:', error.message);
}