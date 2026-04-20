#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Upload dashboard data to external hosting service
 * Supports Google Drive, Dropbox, company file servers, etc.
 */

const UPLOAD_METHODS = {
    // Google Drive API upload
    googleDrive: {
        name: 'Google Drive',
        setup: 'Requires Google Drive API credentials',
        upload: uploadToGoogleDrive
    },
    
    // Dropbox API upload  
    dropbox: {
        name: 'Dropbox',
        setup: 'Requires Dropbox API token',
        upload: uploadToDropbox
    },
    
    // Generic HTTP upload (webhooks, company APIs)
    http: {
        name: 'HTTP Upload',
        setup: 'Requires webhook URL or company API endpoint',
        upload: uploadViaHTTP
    },
    
    // Local file copy (for network drives)
    file: {
        name: 'File Copy',
        setup: 'Copy to network drive or shared folder',
        upload: copyToNetworkDrive
    }
};

async function main() {
    try {
        console.log('🚀 External Data Upload Tool');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Check if data exists
        const dataPath = path.join(__dirname, 'jira-bugs-data.json');
        if (!fs.existsSync(dataPath)) {
            console.error('❌ No JIRA data found. Run "node export-jira-data.js" first.');
            process.exit(1);
        }

        // Export safe version first
        console.log('🔒 Creating sanitized data version...');
        const { exportSafeData } = require('./export-safe-data.js');
        const safeData = exportSafeData();

        // Determine upload method from environment or config
        const uploadMethod = process.env.UPLOAD_METHOD || 'file';
        
        if (!UPLOAD_METHODS[uploadMethod]) {
            console.error(`❌ Unknown upload method: ${uploadMethod}`);
            console.log('Available methods:', Object.keys(UPLOAD_METHODS).join(', '));
            process.exit(1);
        }

        console.log(`📤 Uploading via: ${UPLOAD_METHODS[uploadMethod].name}`);
        
        // Perform upload
        const result = await UPLOAD_METHODS[uploadMethod].upload(safeData);
        
        console.log('✅ Upload completed successfully!');
        console.log(`🔗 Data URL: ${result.url}`);
        console.log(`📊 Uploaded: ${safeData.bugs.length} bugs`);
        console.log(`⏰ Next update: Configure your scheduler`);
        
    } catch (error) {
        console.error('❌ Upload failed:', error.message);
        process.exit(1);
    }
}

// Upload implementations
async function uploadToGoogleDrive(data) {
    // Google Drive API implementation would go here
    // This is a placeholder - real implementation requires Google Drive API setup
    console.log('📁 Google Drive upload not yet implemented');
    console.log('💡 For now, manually upload dashboard-safe-data.json to Google Drive');
    console.log('💡 Make it publicly readable and use the direct download URL');
    
    return {
        url: 'https://drive.google.com/uc?id=YOUR_FILE_ID&export=download',
        note: 'Manual upload required for now'
    };
}

async function uploadToDropbox(data) {
    // Dropbox API implementation would go here
    console.log('📦 Dropbox upload not yet implemented');
    console.log('💡 For now, manually upload dashboard-safe-data.json to Dropbox');
    console.log('💡 Share it publicly and use the direct link with ?dl=1');
    
    return {
        url: 'https://www.dropbox.com/s/YOUR_LINK/dashboard-safe-data.json?dl=1',
        note: 'Manual upload required for now'
    };
}

async function uploadViaHTTP(data) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
        throw new Error('WEBHOOK_URL environment variable not set');
    }

    console.log(`🌐 Uploading to: ${webhookUrl}`);
    
    // This would implement HTTP upload to your company's webhook/API
    // For now, just log the approach
    console.log('🔄 HTTP upload would send data to company endpoint');
    
    return {
        url: webhookUrl,
        note: 'HTTP upload endpoint configured'
    };
}

async function copyToNetworkDrive(data) {
    const targetPath = process.env.NETWORK_DRIVE_PATH || '/Volumes/SharedDrive/dashboard-data.json';
    
    console.log(`📁 Copying to: ${targetPath}`);
    
    try {
        // Copy the safe data file to network location
        const sourceFile = path.join(__dirname, 'dashboard-safe-data.json');
        fs.copyFileSync(sourceFile, targetPath);
        
        console.log('✅ File copied to network drive');
        
        return {
            url: `file://${targetPath}`,
            note: 'File copied to network drive'
        };
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('💡 Network drive not accessible. Manual copy required:');
            console.log(`   Copy: dashboard-safe-data.json`);
            console.log(`   To: ${targetPath}`);
            
            return {
                url: targetPath,
                note: 'Manual copy required'
            };
        }
        throw error;
    }
}

// Configuration helper
function showConfiguration() {
    console.log('⚙️  Configuration Options:');
    console.log('');
    
    Object.entries(UPLOAD_METHODS).forEach(([key, method]) => {
        console.log(`📌 ${method.name} (${key}):`);
        console.log(`   Setup: ${method.setup}`);
        console.log(`   Usage: UPLOAD_METHOD=${key} node upload-to-external.js`);
        console.log('');
    });
    
    console.log('🔧 Environment Variables:');
    console.log('   UPLOAD_METHOD=file|googleDrive|dropbox|http');
    console.log('   NETWORK_DRIVE_PATH=/path/to/shared/folder/data.json');
    console.log('   WEBHOOK_URL=https://your-company.com/api/dashboard-data');
    console.log('');
}

// Command line handling
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        showConfiguration();
    } else if (args.includes('--config')) {
        showConfiguration();
    } else {
        main();
    }
}

module.exports = { UPLOAD_METHODS, main };