#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Export sanitized multi-issue dashboard data for safe sharing
 * Handles Bugs, Stories, and Test Cases while removing sensitive information
 */

function exportMultiIssueSafeData() {
    try {
        // Read the current multi-issue data (from issues-data.json export)
        const dataPath = path.join(__dirname, 'data', 'exports', 'issues-data.json');
        if (!fs.existsSync(dataPath)) {
            console.error('❌ No multi-issue data found. Run "node scripts/export/export-jira-data.js" first.');
            console.log('💡 Or run: node export-multi-issue-data.js');
            process.exit(1);
        }

        const fullData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        
        if (!fullData.issues || fullData.issues.length === 0) {
            console.error('❌ No issues found in data file.');
            process.exit(1);
        }
        
        console.log(`📊 Processing ${fullData.issues.length} issues for safe export...`);
        
        // Create sanitized version - remove potentially sensitive info
        const sanitizedIssues = fullData.issues.map(issue => {
            const base = {
                // Keep analytics-relevant fields
                key: issue.key,
                project: issue.project,
                summary: anonymizeSummary(issue.summary), // Remove sensitive details
                status: issue.status,
                priority: issue.priority,
                assignee: anonymizeUser(issue.assignee), // Remove email domains
                leadingTeam: issue.leadingTeam,
                system: issue.system,
                sprint: issue.sprint,
                sprintName: issue.sprintName,
                createdDate: issue.createdDate,
                updatedDate: issue.updatedDate,
                daysOpen: issue.daysOpen,
                issueType: issue.issueType,
                
                // Remove potentially sensitive fields
                // reporter: removed (might contain sensitive info)
                // description: removed (might contain sensitive details)
                // created: removed (exact timestamps might be sensitive)
                // updated: removed (exact timestamps might be sensitive)
            };

            // Add type-specific fields based on issue type
            if (issue.issueType === 'Bug') {
                base.regression = issue.regression;
                base.severity = issue.severity;
                base.bugType = issue.bugType;
            } else if (issue.issueType === 'Story') {
                base.storyPoints = issue.storyPoints;
                base.epicLink = anonymizeEpicLink(issue.epicLink);
                base.testCaseCreated = issue.testCaseCreated;
                base.fixDuration = issue.fixDuration;
            } else if (issue.issueType === 'Test Case' || issue.issueType === 'Test') {
                base.generatedFromAI = issue.generatedFromAI;
                base.aiGeneratedTestCases = anonymizeURL(issue.aiGeneratedTestCases);
                base.testType = issue.testType;
            }

            return base;
        });

        // Create safe export data
        const safeData = {
            issues: sanitizedIssues,
            metadata: {
                exported: new Date().toISOString(),
                totalIssues: sanitizedIssues.length,
                issueTypes: [...new Set(sanitizedIssues.map(issue => issue.issueType))],
                dataType: 'sanitized',
                githubPagesReady: true,
                note: 'This export contains anonymized multi-issue data suitable for sharing'
            },
            stats: generateMultiIssueSafeStats(sanitizedIssues)
        };

        // Ensure output directory exists
        const outputDir = path.join(__dirname, 'data', 'exports');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Write sanitized data file
        const outputFile = path.join(outputDir, 'multi-dashboard-safe-data.json');
        fs.writeFileSync(outputFile, JSON.stringify(safeData, null, 2));

        console.log('✅ Safe multi-issue data exported successfully!');
        console.log(`📄 File: ${outputFile}`);
        console.log(`📊 Issues: ${safeData.issues.length}`);
        console.log(`🗂️  Types: ${safeData.metadata.issueTypes.join(', ')}`);
        console.log(`🔒 Sensitive info: Anonymized`);
        console.log('');
        console.log('🎯 This file is safe to share via:');
        console.log('   - GitHub Pages (public repository)');
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

// Anonymize issue summaries to remove sensitive details
function anonymizeSummary(summary) {
    if (!summary) return 'Issue Report';
    
    // Remove potential sensitive patterns
    return summary
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Remove emails
        .replace(/\b(?:password|token|key|secret|credential|api[_-]?key)\b/gi, '[REDACTED]') // Remove sensitive keywords
        .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]') // Remove IP addresses
        .replace(/\b(?:https?:\/\/)[^\s]+/g, '[URL]') // Remove URLs except for display
        .substring(0, 150); // Truncate to reasonable length
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

// Anonymize epic links (keep structure but remove sensitive parts)
function anonymizeEpicLink(epicLink) {
    if (!epicLink) return epicLink;
    
    // Keep the epic key pattern but ensure no sensitive data
    return epicLink.replace(/[A-Z]+-\d+/, 'EPIC-XXX');
}

// Anonymize URLs (keep the fact that there's a URL but remove the actual URL)
function anonymizeURL(url) {
    if (!url) return url;
    
    if (url.includes('http')) {
        return '[AI_GENERATION_LINK]';
    }
    
    return url;
}

// Generate comprehensive statistics from sanitized multi-issue data
function generateMultiIssueSafeStats(issues) {
    const stats = {
        totalIssues: issues.length,
        byIssueType: {},
        byProject: {},
        byStatus: {},
        byPriority: {},
        byLeadingTeam: {},
        bySystem: {},
        bySprint: {},
        averageDaysOpen: 0
    };

    // Bug-specific stats
    const bugs = issues.filter(issue => issue.issueType === 'Bug');
    if (bugs.length > 0) {
        stats.bugSpecific = {
            totalBugs: bugs.length,
            bySeverity: {},
            byRegression: {}
        };
    }

    // Story-specific stats
    const stories = issues.filter(issue => issue.issueType === 'Story');
    if (stories.length > 0) {
        stats.storySpecific = {
            totalStories: stories.length,
            byTestCaseCreated: {},
            totalStoryPoints: 0,
            averageStoryPoints: 0
        };
    }

    // Test case-specific stats
    const testCases = issues.filter(issue => issue.issueType === 'Test Case' || issue.issueType === 'Test');
    if (testCases.length > 0) {
        stats.testCaseSpecific = {
            totalTestCases: testCases.length,
            byTestType: {},
            byAIGenerated: {}
        };
    }

    let totalDays = 0;
    let totalStoryPoints = 0;

    issues.forEach(issue => {
        // Count by various dimensions
        stats.byIssueType[issue.issueType] = (stats.byIssueType[issue.issueType] || 0) + 1;
        stats.byProject[issue.project] = (stats.byProject[issue.project] || 0) + 1;
        stats.byStatus[issue.status] = (stats.byStatus[issue.status] || 0) + 1;
        stats.byPriority[issue.priority] = (stats.byPriority[issue.priority] || 0) + 1;
        
        if (issue.leadingTeam) {
            stats.byLeadingTeam[issue.leadingTeam] = (stats.byLeadingTeam[issue.leadingTeam] || 0) + 1;
        }
        
        if (issue.system) {
            stats.bySystem[issue.system] = (stats.bySystem[issue.system] || 0) + 1;
        }
        
        if (issue.sprint) {
            stats.bySprint[issue.sprint] = (stats.bySprint[issue.sprint] || 0) + 1;
        }
        
        totalDays += issue.daysOpen || 0;

        // Type-specific processing
        if (issue.issueType === 'Bug') {
            if (issue.severity && stats.bugSpecific) {
                stats.bugSpecific.bySeverity[issue.severity] = (stats.bugSpecific.bySeverity[issue.severity] || 0) + 1;
            }
            if (issue.regression && stats.bugSpecific) {
                stats.bugSpecific.byRegression[issue.regression] = (stats.bugSpecific.byRegression[issue.regression] || 0) + 1;
            }
        } else if (issue.issueType === 'Story') {
            if (issue.testCaseCreated && stats.storySpecific) {
                stats.storySpecific.byTestCaseCreated[issue.testCaseCreated] = (stats.storySpecific.byTestCaseCreated[issue.testCaseCreated] || 0) + 1;
            }
            if (issue.storyPoints && stats.storySpecific) {
                totalStoryPoints += parseFloat(issue.storyPoints) || 0;
            }
        } else if (issue.issueType === 'Test Case' || issue.issueType === 'Test') {
            if (issue.testType && stats.testCaseSpecific) {
                stats.testCaseSpecific.byTestType[issue.testType] = (stats.testCaseSpecific.byTestType[issue.testType] || 0) + 1;
            }
            if (issue.generatedFromAI && stats.testCaseSpecific) {
                stats.testCaseSpecific.byAIGenerated[issue.generatedFromAI] = (stats.testCaseSpecific.byAIGenerated[issue.generatedFromAI] || 0) + 1;
            }
        }
    });

    stats.averageDaysOpen = Math.round(totalDays / issues.length);

    if (stats.storySpecific && stories.length > 0) {
        stats.storySpecific.totalStoryPoints = totalStoryPoints;
        stats.storySpecific.averageStoryPoints = Math.round((totalStoryPoints / stories.length) * 10) / 10;
    }

    return stats;
}

if (require.main === module) {
    exportMultiIssueSafeData();
}

module.exports = { exportMultiIssueSafeData };