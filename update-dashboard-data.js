const fs = require('fs');
const path = require('path');

// Read the new exported data
const newDataPath = path.join(__dirname, 'jira-bugs-data.json');
const newData = JSON.parse(fs.readFileSync(newDataPath, 'utf8'));

// Read the current dashboard HTML
const htmlPath = path.join(__dirname, 'bug-dashboard-embedded.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Find the start and end of the embedded data
const dataStart = '        const data = {';
const dataEnd = '};';

const startIndex = htmlContent.indexOf(dataStart);
const endIndex = htmlContent.indexOf(dataEnd, startIndex) + dataEnd.length;

if (startIndex === -1 || endIndex === -1) {
    console.error('❌ Could not find embedded data section in HTML file');
    process.exit(1);
}

// Extract the parts before and after the data section
const beforeData = htmlContent.substring(0, startIndex);
const afterData = htmlContent.substring(endIndex);

// Create the new data section
const newDataSection = `        const data = ${JSON.stringify(newData, null, 2)};`;

// Combine everything
const updatedHtml = beforeData + newDataSection + afterData;

// Write the updated HTML file
fs.writeFileSync(htmlPath, updatedHtml);

console.log('✅ Dashboard HTML updated with new data!');
console.log(`📊 Updated with ${newData.bugs.length} bugs`);
console.log(`🕒 Data exported at: ${newData.metadata.exported}`);

// Verify a sample bug has the expected fields
const sampleBug = newData.bugs[0];
const expectedFields = ['severity', 'leadingTeam', 'system', 'sprint', 'regression'];
const missingFields = expectedFields.filter(field => !sampleBug.hasOwnProperty(field));

if (missingFields.length > 0) {
    console.warn(`⚠️  Warning: Some expected fields are missing: ${missingFields.join(', ')}`);
} else {
    console.log('✅ All expected fields are present in the data!');
    console.log(`   Sample bug (${sampleBug.key}):`)
    expectedFields.forEach(field => {
        console.log(`   - ${field}: ${sampleBug[field] || 'null'}`);
    });
}