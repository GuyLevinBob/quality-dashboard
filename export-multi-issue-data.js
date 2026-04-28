#!/usr/bin/env node

/**
 * Export Multi-Issue Data for GitHub Pages
 * 
 * This script generates multi-dashboard-data.json by fetching data from the 
 * issues-lite API endpoint, following the same pattern as the existing 
 * dashboard-data.json generation.
 * 
 * Usage:
 *   node export-multi-issue-data.js
 *   
 * Output: 
 *   multi-dashboard-data.json - Static data file for GitHub Pages hosting
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

class MultiIssueDataExporter {
    constructor(apiBase = 'http://localhost:3002') {
        this.apiBase = apiBase;
        this.outputFile = 'multi-dashboard-data.json';
    }

    async exportData() {
        try {
            console.log('🚀 Starting multi-issue data export...');
            console.log(`📡 API Base: ${this.apiBase}`);
            
            // Fetch data from the issues-lite endpoint
            console.log('📊 Fetching multi-issue data from API...');
            const issuesData = await this.fetchFromAPI('/api/issues-lite?types=Bug,Story,Test');
            
            if (!issuesData || !issuesData.issues) {
                throw new Error('No issues data received from API');
            }
            
            console.log(`✅ Received ${issuesData.issues.length} issues`);
            console.log(`📋 Issue types: ${issuesData.metadata.issueTypes.join(', ')}`);
            
            // Prepare the data structure (matches the format expected by dashboard)
            const exportData = {
                issues: issuesData.issues,
                metadata: {
                    totalIssues: issuesData.metadata.totalIssues,
                    issueTypes: issuesData.metadata.issueTypes,
                    lastSync: issuesData.metadata.lastSync,
                    jiraInstance: issuesData.metadata.jiraInstance,
                    exported: new Date().toISOString(),
                    exportedBy: 'export-multi-issue-data.js',
                    githubPagesReady: true
                }
            };
            
            // Write to file
            console.log(`📁 Writing data to ${this.outputFile}...`);
            const jsonString = JSON.stringify(exportData, null, 2);
            fs.writeFileSync(this.outputFile, jsonString, 'utf8');
            
            const fileSizeKB = Math.round(jsonString.length / 1024);
            console.log(`✅ Export completed successfully!`);
            console.log(`📊 File: ${this.outputFile} (${fileSizeKB}KB)`);
            console.log(`📈 Total issues: ${exportData.issues.length}`);
            console.log(`🗂️  Issue types: ${exportData.metadata.issueTypes.join(', ')}`);
            console.log(`⏰ Last sync: ${exportData.metadata.lastSync || 'Unknown'}`);
            
            return exportData;
            
        } catch (error) {
            console.error('❌ Export failed:', error.message);
            
            // Provide troubleshooting help
            console.log('\n🔧 Troubleshooting:');
            console.log('   1. Make sure the API server is running (node api/bug-api-server.js)');
            console.log('   2. Verify the server is accessible at http://localhost:3002');
            console.log('   3. Check that issues data has been synced recently');
            console.log('   4. Try: curl http://localhost:3002/api/issues-lite?types=Bug,Story,Test');
            
            throw error;
        }
    }

    async fetchFromAPI(endpoint) {
        return new Promise((resolve, reject) => {
            const url = `${this.apiBase}${endpoint}`;
            console.log(`   Calling: ${url}`);
            
            const request = http.get(url, (response) => {
                let data = '';
                
                response.on('data', chunk => {
                    data += chunk;
                });
                
                response.on('end', () => {
                    try {
                        if (response.statusCode !== 200) {
                            reject(new Error(`API returned ${response.statusCode}: ${data}`));
                            return;
                        }
                        
                        const parsedData = JSON.parse(data);
                        resolve(parsedData);
                    } catch (error) {
                        reject(new Error(`Failed to parse API response: ${error.message}`));
                    }
                });
            });
            
            request.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });
            
            request.setTimeout(30000, () => {
                request.destroy();
                reject(new Error('Request timed out'));
            });
        });
    }

    async checkAPIHealth() {
        try {
            const healthData = await this.fetchFromAPI('/health');
            console.log(`✅ API server is healthy: ${healthData.status}`);
            return true;
        } catch (error) {
            console.log(`❌ API server health check failed: ${error.message}`);
            return false;
        }
    }
}

// Command line interface
async function main() {
    try {
        const exporter = new MultiIssueDataExporter();
        
        // Check API health first
        console.log('🔍 Checking API server health...');
        const isHealthy = await exporter.checkAPIHealth();
        
        if (!isHealthy) {
            console.log('\n⚠️  API server appears to be down or unreachable.');
            console.log('   Please start the server first: node api/bug-api-server.js');
            process.exit(1);
        }
        
        // Export the data
        await exporter.exportData();
        
        console.log('\n🎉 Multi-issue data export complete!');
        console.log('📋 Next steps:');
        console.log('   1. Review multi-dashboard-data.json');
        console.log('   2. Test the dashboard with static data');
        console.log('   3. Commit and push to deploy to GitHub Pages');
        
    } catch (error) {
        console.error('\n💥 Export failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { MultiIssueDataExporter };