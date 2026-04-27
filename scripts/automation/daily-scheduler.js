#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Local scheduler for daily dashboard updates
 * Runs on your machine, no Git secrets required
 */

class DashboardScheduler {
    constructor(options = {}) {
        this.interval = options.interval || 24 * 60 * 60 * 1000; // 24 hours
        this.logFile = options.logFile || path.join(__dirname, 'scheduler.log');
        this.isRunning = false;
        this.nextRun = null;
    }

    start() {
        this.log('🚀 Dashboard Scheduler Started');
        this.log(`⏰ Update interval: ${this.interval / 1000 / 60 / 60} hours`);
        
        this.isRunning = true;
        
        // Run immediately on start
        this.runUpdate();
        
        // Schedule recurring updates
        this.scheduleNext();
    }

    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
        this.log('⏹️  Dashboard Scheduler Stopped');
    }

    scheduleNext() {
        if (!this.isRunning) return;
        
        this.nextRun = new Date(Date.now() + this.interval);
        this.log(`📅 Next update scheduled: ${this.nextRun.toLocaleString()}`);
        
        this.timer = setTimeout(() => {
            this.runUpdate();
            this.scheduleNext();
        }, this.interval);
    }

    async runUpdate() {
        this.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.log('🔄 Starting scheduled dashboard update...');
        
        try {
            // Step 1: Export fresh JIRA data
            this.log('📊 Exporting fresh JIRA data...');
            await this.runCommand('node', ['export-jira-data.js']);
            
            // Step 2: Create safe data version
            this.log('🔒 Creating safe data version...');
            await this.runCommand('node', ['export-safe-data.js']);
            
            // Step 3: Upload to external hosting
            this.log('📤 Uploading to external hosting...');
            await this.runCommand('node', ['upload-to-external.js']);
            
            this.log('✅ Scheduled update completed successfully!');
            
        } catch (error) {
            this.log(`❌ Update failed: ${error.message}`);
            
            // Optional: Send notification (email, Slack, etc.)
            this.sendFailureNotification(error);
        }
    }

    runCommand(command, args) {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, { 
                cwd: __dirname,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let output = '';
            let errorOutput = '';
            
            process.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                this.log(`   ${text.trim()}`);
            });
            
            process.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;
                this.log(`   ERROR: ${text.trim()}`);
            });
            
            process.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`Command failed with code ${code}: ${errorOutput}`));
                }
            });
            
            process.on('error', reject);
        });
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}\n`;
        
        console.log(message);
        
        try {
            fs.appendFileSync(this.logFile, logEntry);
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }

    sendFailureNotification(error) {
        // Placeholder for notification system
        this.log('📧 Notification: Update failed - manual intervention required');
        
        // You could implement:
        // - Email notifications
        // - Slack webhooks  
        // - Teams notifications
        // - SMS alerts
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            nextRun: this.nextRun,
            logFile: this.logFile,
            interval: this.interval
        };
    }
}

// Configuration from environment
const config = {
    interval: (process.env.UPDATE_INTERVAL_HOURS || 24) * 60 * 60 * 1000,
    logFile: process.env.LOG_FILE || path.join(__dirname, 'scheduler.log')
};

// Command line interface
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'start':
            startDaemon();
            break;
            
        case 'run-once':
            runOnce();
            break;
            
        case 'status':
            showStatus();
            break;
            
        case 'logs':
            showLogs();
            break;
            
        default:
            showHelp();
    }
}

function startDaemon() {
    console.log('🚀 Starting Dashboard Scheduler...');
    
    const scheduler = new DashboardScheduler(config);
    scheduler.start();
    
    // Keep process alive
    process.on('SIGINT', () => {
        console.log('\n⏹️  Stopping scheduler...');
        scheduler.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        scheduler.stop();
        process.exit(0);
    });
}

async function runOnce() {
    console.log('⚡ Running one-time update...');
    
    const scheduler = new DashboardScheduler(config);
    await scheduler.runUpdate();
    
    console.log('✅ One-time update completed');
}

function showStatus() {
    const logFile = config.logFile;
    
    if (fs.existsSync(logFile)) {
        console.log('📊 Recent scheduler activity:');
        const logs = fs.readFileSync(logFile, 'utf8');
        const recentLogs = logs.split('\n').slice(-10).join('\n');
        console.log(recentLogs);
    } else {
        console.log('ℹ️  No scheduler logs found');
    }
}

function showLogs() {
    const logFile = config.logFile;
    
    if (fs.existsSync(logFile)) {
        const logs = fs.readFileSync(logFile, 'utf8');
        console.log(logs);
    } else {
        console.log('ℹ️  No log file found');
    }
}

function showHelp() {
    console.log('🤖 Dashboard Scheduler - Daily JIRA Data Updates');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Commands:');
    console.log('  start      Start the scheduler daemon (runs continuously)');
    console.log('  run-once   Run a single update immediately');
    console.log('  status     Show recent scheduler activity');
    console.log('  logs       Show full scheduler logs');
    console.log('');
    console.log('Environment Variables:');
    console.log('  UPDATE_INTERVAL_HOURS=24   Update frequency in hours');
    console.log('  LOG_FILE=scheduler.log     Log file location');
    console.log('  UPLOAD_METHOD=file         Upload method (file/http/etc)');
    console.log('');
    console.log('Examples:');
    console.log('  node daily-scheduler.js start           # Start continuous updates');
    console.log('  node daily-scheduler.js run-once        # Single update now');
    console.log('  UPDATE_INTERVAL_HOURS=12 node daily-scheduler.js start  # Every 12 hours');
    console.log('');
    console.log('🔒 Security: No secrets stored in Git - uses local .env file only');
}

if (require.main === module) {
    main();
}

module.exports = { DashboardScheduler };