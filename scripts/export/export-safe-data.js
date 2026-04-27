#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Export sanitized dashboard data for safe sharing
 * Removes any potentially sensitive information while keeping analytics intact
 */

function exportSafeData() {
    try {
        // Read the current JIRA data
        const dataPath = path.join(__dirname, 'jira-bugs-data.json');
        if (!fs.existsSync(dataPath)) {
            console.error('❌ No JIRA data found. Run "node export-jira-data.js" first.');
            process.exit(1);
        }

        const fullData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        
        // Create sanitized version - remove potentially sensitive info
        const sanitizedBugs = fullData.bugs.map(bug => ({
            // Keep analytics-relevant fields
            key: bug.key,
            project: bug.project,
            summary: anonymizeSummary(bug.summary), // Remove sensitive details
            status: bug.status,
            priority: bug.priority,
            severity: bug.severity,
            assignee: anonymizeUser(bug.assignee), // Remove email domains
            leadingTeam: bug.leadingTeam,
            system: bug.system,
            sprint: bug.sprint,
            regression: bug.regression,
            createdDate: bug.createdDate,
            updatedDate: bug.updatedDate,
            daysOpen: bug.daysOpen,
            
            // Remove potentially sensitive fields
            // reporter: removed (might contain sensitive info)
            // description: removed (might contain sensitive details)
            // created: removed (exact timestamps might be sensitive)
            // updated: removed (exact timestamps might be sensitive)
        }));

        // Create safe export data
        const safeData = {
            metadata: {
                exported: new Date().toISOString(),
                totalBugs: sanitizedBugs.length,
                projects: fullData.metadata.projects,
                dataType: 'sanitized',
                note: 'This export contains anonymized data suitable for sharing'
            },
            bugs: sanitizedBugs,
            stats: generateSafeStats(sanitizedBugs)
        };

        // Write sanitized data file
        const outputFile = path.join(__dirname, 'data', 'exports', 'dashboard-safe-data.json');
        fs.writeFileSync(outputFile, JSON.stringify(safeData, null, 2));

        console.log('✅ Safe data exported successfully!');
        console.log(`📄 File: ${outputFile}`);
        console.log(`📊 Bugs: ${safeData.bugs.length}`);
        console.log(`🔒 Sensitive info: Anonymized`);
        console.log('');
        console.log('🎯 This file is safe to share via:');
        console.log('   - Company file sharing (Box, Google Drive, etc.)');
        console.log('   - Email attachments');
        console.log('   - Team chat platforms');
        console.log('   - Internal wikis/documentation');

        return safeData;

    } catch (error) {
        console.error('❌ Export failed:', error.message);
        process.exit(1);
    }
}

// Anonymize bug summaries to remove sensitive details
function anonymizeSummary(summary) {
    if (!summary) return 'Bug Report';
    
    // Remove potential sensitive patterns
    return summary
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Remove emails
        .replace(/\b(?:password|token|key|secret|credential)\b/gi, '[REDACTED]') // Remove sensitive keywords
        .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]') // Remove IP addresses
        .substring(0, 100); // Truncate to reasonable length
}

// Anonymize user names to remove email domains
function anonymizeUser(user) {
    if (!user || user === 'Unassigned') return user;
    
    // If it looks like an email, just keep the name part
    if (user.includes('@')) {
        return user.split('@')[0];
    }
    
    return user;
}

// Generate statistics from sanitized data
function generateSafeStats(bugs) {
    const stats = {
        totalBugs: bugs.length,
        byProject: {},
        byStatus: {},
        byPriority: {},
        bySeverity: {},
        byLeadingTeam: {},
        bySystem: {},
        bySprint: {},
        byRegression: {},
        averageDaysOpen: 0
    };

    let totalDays = 0;

    bugs.forEach(bug => {
        // Count by various dimensions
        stats.byProject[bug.project] = (stats.byProject[bug.project] || 0) + 1;
        stats.byStatus[bug.status] = (stats.byStatus[bug.status] || 0) + 1;
        stats.byPriority[bug.priority] = (stats.byPriority[bug.priority] || 0) + 1;
        
        if (bug.severity) {
            stats.bySeverity[bug.severity] = (stats.bySeverity[bug.severity] || 0) + 1;
        }
        
        if (bug.leadingTeam) {
            stats.byLeadingTeam[bug.leadingTeam] = (stats.byLeadingTeam[bug.leadingTeam] || 0) + 1;
        }
        
        if (bug.system) {
            stats.bySystem[bug.system] = (stats.bySystem[bug.system] || 0) + 1;
        }
        
        if (bug.sprint) {
            stats.bySprint[bug.sprint] = (stats.bySprint[bug.sprint] || 0) + 1;
        }
        
        if (bug.regression) {
            stats.byRegression[bug.regression] = (stats.byRegression[bug.regression] || 0) + 1;
        }
        
        totalDays += bug.daysOpen;
    });

    stats.averageDaysOpen = Math.round(totalDays / bugs.length);

    return stats;
}

if (require.main === module) {
    exportSafeData();
}

module.exports = { exportSafeData };