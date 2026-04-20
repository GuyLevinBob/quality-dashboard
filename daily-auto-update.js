#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Local automation script that:
 * 1. Exports fresh JIRA data (using local .env)
 * 2. Creates safe version
 * 3. Updates dashboard-data.json 
 * 4. Commits and pushes to GitHub
 * 5. GitHub Pages serves updated dashboard automatically
 * 
 * SECURITY: Your JIRA credentials never leave your computer!
 */

async function runDailyUpdate() {
    try {
        console.log('🚀 Starting daily dashboard update...');
        console.log('🔒 Using local JIRA credentials (secure)');
        
        // Step 1: Export fresh JIRA data
        console.log('\n📊 Step 1: Exporting fresh JIRA data...');
        await runCommand('node', ['export-jira-data.js']);
        
        // Step 2: Create safe anonymized version
        console.log('\n🔒 Step 2: Creating safe anonymized version...');
        await runCommand('node', ['export-safe-data.js']);
        
        // Step 3: Copy to dashboard data file
        console.log('\n📋 Step 3: Updating dashboard data file...');
        fs.copyFileSync('dashboard-safe-data.json', 'dashboard-data.json');
        console.log('✅ Dashboard data file updated');
        
        // Step 4: Check if there are changes
        const hasChanges = await checkForChanges();
        if (!hasChanges) {
            console.log('ℹ️  No changes detected - data is already up to date');
            return;
        }
        
        // Step 5: Commit and push changes
        console.log('\n🔄 Step 4: Committing and pushing to GitHub...');
        const timestamp = new Date().toISOString();
        const commitMessage = `🤖 Auto-update dashboard data - ${timestamp}`;
        
        await runCommand('git', ['add', 'dashboard-data.json']);
        await runCommand('git', ['commit', '-m', commitMessage]);
        await runCommand('git', ['push']);
        
        console.log('✅ Dashboard update completed successfully!');
        console.log('🌐 Your team dashboard will refresh automatically');
        console.log('📊 Updated with latest JIRA data');
        
        // Step 6: Display summary
        const data = JSON.parse(fs.readFileSync('dashboard-data.json', 'utf8'));
        console.log(`\n📈 Summary:`);
        console.log(`   Total Bugs: ${data.bugs.length}`);
        console.log(`   Last Export: ${data.metadata.exported}`);
        console.log(`   Dashboard URL: https://guylevinbob.github.io/quality-dashboard/dashboard-automated.html`);
        
    } catch (error) {
        console.error('❌ Update failed:', error.message);
        
        // Provide troubleshooting help
        console.log('\n🔧 Troubleshooting:');
        console.log('   1. Check your .env file has valid JIRA credentials');
        console.log('   2. Ensure you have git access to push changes');
        console.log('   3. Verify network connectivity to JIRA');
        
        process.exit(1);
    }
}

function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        console.log(`   Running: ${command} ${args.join(' ')}`);
        
        const process = spawn(command, args, { 
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let errorOutput = '';
        
        process.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            // Show condensed output for key operations
            if (text.includes('✅') || text.includes('bugs') || text.includes('exported')) {
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

async function checkForChanges() {
    try {
        const result = await runCommand('git', ['diff', '--quiet', 'dashboard-data.json']);
        return false; // No changes if diff is quiet
    } catch (error) {
        return true; // Changes exist if diff fails
    }
}

function showHelp() {
    console.log('🤖 Daily Dashboard Auto-Update');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('This script safely updates your team dashboard with fresh JIRA data.');
    console.log('');
    console.log('🔒 Security Features:');
    console.log('  ✅ JIRA credentials stay on your computer (never uploaded)');
    console.log('  ✅ Only anonymized data goes to GitHub');
    console.log('  ✅ Your team gets automatic updates');
    console.log('');
    console.log('📋 What it does:');
    console.log('  1. Export fresh JIRA data using your local .env file');
    console.log('  2. Create anonymized version (removes sensitive info)');
    console.log('  3. Update dashboard-data.json in your repository');
    console.log('  4. Push changes to GitHub');
    console.log('  5. GitHub Pages automatically serves updated dashboard');
    console.log('');
    console.log('🚀 Usage:');
    console.log('  node daily-auto-update.js        # Run update now');
    console.log('  node daily-auto-update.js --help # Show this help');
    console.log('');
    console.log('⏰ Automation Options:');
    console.log('  • Run manually when you want fresh data');
    console.log('  • Set up cron job for daily automation');
    console.log('  • Use system scheduler (Task Scheduler/launchd)');
    console.log('');
    console.log('🌐 Team Access:');
    console.log('  Share this URL: https://guylevinbob.github.io/quality-dashboard/dashboard-automated.html');
}

// Command line interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        showHelp();
    } else {
        runDailyUpdate();
    }
}

module.exports = { runDailyUpdate };