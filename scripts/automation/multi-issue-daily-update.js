#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Multi-Issue Daily Automation Script
 * 
 * This script:
 * 1. Exports fresh multi-issue JIRA data (Bugs, Stories, Test Cases)
 * 2. Creates safe anonymized version
 * 3. Updates multi-dashboard-data.json 
 * 4. Commits and pushes to GitHub
 * 5. GitHub Pages serves updated multi-issue dashboard automatically
 * 
 * SECURITY: Your JIRA credentials never leave your computer!
 */

async function runMultiIssueDailyUpdate() {
    try {
        console.log('🚀 Starting multi-issue dashboard daily update...');
        console.log('🔒 Using local JIRA credentials (secure)');
        console.log('📊 Processing Bugs, Stories, and Test Cases');
        
        // Step 1: Export fresh multi-issue JIRA data
        console.log('\n📊 Step 1: Exporting fresh multi-issue JIRA data...');
        await runCommand('node', ['scripts/export/export-jira-data.js']);
        
        // Step 2: Create safe anonymized version for multi-issues
        console.log('\n🔒 Step 2: Creating safe anonymized multi-issue version...');
        await runCommand('node', ['export-multi-issue-safe-data.js']);
        
        // Step 3: Copy to multi-dashboard data file
        console.log('\n📋 Step 3: Updating multi-dashboard data file...');
        const sourceFile = 'data/exports/multi-dashboard-safe-data.json';
        const targetFile = 'multi-dashboard-data.json';
        
        if (!fs.existsSync(sourceFile)) {
            throw new Error(`Source file not found: ${sourceFile}`);
        }
        
        fs.copyFileSync(sourceFile, targetFile);
        console.log('✅ Multi-dashboard data file updated');
        
        // Step 4: Check if there are changes
        const hasChanges = await checkForChanges(targetFile);
        if (!hasChanges) {
            console.log('ℹ️  No changes detected - multi-issue data is already up to date');
            return;
        }
        
        // Step 5: Commit and push changes
        console.log('\n🔄 Step 4: Committing and pushing to GitHub...');
        const timestamp = new Date().toISOString();
        const commitMessage = `🤖 Auto-update multi-issue dashboard data - ${timestamp}

- Synced fresh JIRA data (Bugs, Stories, Test Cases)
- File: multi-dashboard-data.json
- Updated for management access`;
        
        await runCommand('git', ['add', targetFile]);
        await runCommand('git', ['commit', '-m', commitMessage]);
        await runCommand('git', ['push']);
        
        console.log('✅ Multi-issue dashboard update completed successfully!');
        console.log('🌐 Your team dashboard will refresh automatically');
        console.log('📊 Updated with latest multi-issue JIRA data');
        
        // Step 6: Display summary
        const data = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
        console.log(`\n📈 Summary:`);
        console.log(`   Total Issues: ${data.issues.length}`);
        console.log(`   Issue Types: ${data.metadata.issueTypes.join(', ')}`);
        console.log(`   Last Export: ${data.metadata.exported}`);
        console.log(`   Dashboard URL: https://guylevinbob.github.io/quality-dashboard/dashboard-multi-issue.html`);
        
    } catch (error) {
        console.error('❌ Multi-issue update failed:', error.message);
        
        // Provide troubleshooting help
        console.log('\n🔧 Troubleshooting:');
        console.log('   1. Check your .env file has valid JIRA credentials');
        console.log('   2. Ensure you have git access to push changes');
        console.log('   3. Verify network connectivity to JIRA');
        console.log('   4. Make sure API server can fetch multi-issue data');
        console.log('   5. Try running: node export-multi-issue-data.js');
        
        process.exit(1);
    }
}

function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        console.log(`   Running: ${command} ${args.join(' ')}`);
        
        const process = spawn(command, args, { 
            cwd: path.join(__dirname, '..', '..'),  // Run from project root
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let errorOutput = '';
        
        process.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            // Show condensed output for key operations
            if (text.includes('✅') || text.includes('issues') || text.includes('exported') || 
                text.includes('bugs') || text.includes('stories') || text.includes('test')) {
                console.log(`   ${text.trim()}`);
            }
        });
        
        process.stderr.on('data', (data) => {
            const text = data.toString();
            errorOutput += text;
        });
        
        process.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(`Command failed: ${command} ${args.join(' ')}\n${errorOutput}`));
            }
        });
        
        process.on('error', reject);
    });
}

async function checkForChanges(filename) {
    try {
        const result = await runCommand('git', ['diff', '--quiet', filename]);
        return false; // No changes if diff is quiet
    } catch (error) {
        return true; // Changes exist if diff fails
    }
}

function showHelp() {
    console.log('🤖 Multi-Issue Dashboard Daily Auto-Update');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('This script safely updates your multi-issue dashboard with comprehensive JIRA data.');
    console.log('');
    console.log('📊 Data Coverage:');
    console.log('  ✅ Bugs (Production issues with severity tracking)');
    console.log('  ✅ Stories (User stories with test case creation tracking)'); 
    console.log('  ✅ Test Cases (Automated tests with AI generation tracking)');
    console.log('');
    console.log('🔒 Security Features:');
    console.log('  ✅ JIRA credentials stay on your computer (never uploaded)');
    console.log('  ✅ Only anonymized data goes to GitHub');
    console.log('  ✅ Your team gets automatic comprehensive analytics');
    console.log('');
    console.log('📋 What it does:');
    console.log('  1. Export fresh multi-issue JIRA data using your local .env file');
    console.log('  2. Create anonymized version (removes sensitive info)');
    console.log('  3. Update multi-dashboard-data.json in your repository');
    console.log('  4. Push changes to GitHub');
    console.log('  5. GitHub Pages automatically serves updated multi-issue dashboard');
    console.log('');
    console.log('🚀 Usage:');
    console.log('  node multi-issue-daily-update.js        # Run update now');
    console.log('  node multi-issue-daily-update.js --help # Show this help');
    console.log('');
    console.log('⏰ Automation Options:');
    console.log('  • Run manually when you want fresh comprehensive data');
    console.log('  • Set up cron job for daily automation');
    console.log('  • Use system scheduler (Task Scheduler/launchd)');
    console.log('  • Combine with bug-only updates for different schedules');
    console.log('');
    console.log('🌐 Team Access:');
    console.log('  Share this URL: https://guylevinbob.github.io/quality-dashboard/dashboard-multi-issue.html');
    console.log('');
    console.log('🔄 Comparison with Bug-Only Dashboard:');
    console.log('  • Bug Dashboard: Fast updates, production focus');
    console.log('  • Multi-Issue Dashboard: Comprehensive analytics, all issue types');
}

// Command line interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        showHelp();
    } else {
        runMultiIssueDailyUpdate();
    }
}

module.exports = { runMultiIssueDailyUpdate };