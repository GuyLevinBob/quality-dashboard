#!/usr/bin/env node

/**
 * Sync Protection and Dry-Run Testing System
 * 
 * This module provides safeguards for sync functionality during unified cache migration.
 * It includes dry-run capabilities, data validation, and rollback mechanisms.
 */

const fs = require('fs');
const path = require('path');
const BaselineCapture = require('./migration-baseline-capture.js');

class SyncProtection {
    constructor(dryRun = true) {
        this.dryRun = dryRun;
        this.backupDir = path.join(__dirname, 'migration-backups');
        this.testCacheDir = path.join(__dirname, 'test-cache');
        
        // Create necessary directories
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
        if (!fs.existsSync(this.testCacheDir)) {
            fs.mkdirSync(this.testCacheDir, { recursive: true });
        }
        
        this.baseline = null;
        this.validationResults = {
            passed: [],
            failed: [],
            warnings: []
        };
    }

    // Load baseline for validation
    async loadBaseline() {
        try {
            const baselineFiles = fs.readdirSync(__dirname)
                .filter(f => f.startsWith('baseline-') && f.endsWith('.json'))
                .sort()
                .reverse(); // Most recent first

            if (baselineFiles.length === 0) {
                throw new Error('No baseline file found. Run migration-baseline-capture.js first.');
            }

            const baselineFile = baselineFiles[0];
            console.log(`📊 Loading baseline from: ${baselineFile}`);
            
            const baselineData = fs.readFileSync(path.join(__dirname, baselineFile), 'utf8');
            this.baseline = JSON.parse(baselineData);
            
            return this.baseline;
        } catch (error) {
            console.error('❌ Failed to load baseline:', error.message);
            throw error;
        }
    }

    // Create backups of current cache files
    createBackups() {
        console.log('💾 Creating cache file backups...');
        
        const timestamp = Date.now();
        const backups = {};
        
        // Backup bugs-cache.json
        const bugsFile = path.join(__dirname, 'bugs-cache.json');
        if (fs.existsSync(bugsFile)) {
            const bugsBackup = path.join(this.backupDir, `bugs-cache-${timestamp}.json`);
            fs.copyFileSync(bugsFile, bugsBackup);
            backups.bugsCache = bugsBackup;
            console.log(`  ✅ bugs-cache.json → ${path.basename(bugsBackup)}`);
        }
        
        // Backup issues-cache.json
        const issuesFile = path.join(__dirname, 'data', 'cache', 'issues-cache.json');
        if (fs.existsSync(issuesFile)) {
            const issuesBackup = path.join(this.backupDir, `issues-cache-${timestamp}.json`);
            fs.copyFileSync(issuesFile, issuesBackup);
            backups.issuesCache = issuesBackup;
            console.log(`  ✅ issues-cache.json → ${path.basename(issuesBackup)}`);
        }
        
        return backups;
    }

    // Create test cache environment
    createTestCacheEnvironment() {
        console.log('🧪 Setting up test cache environment...');
        
        // Copy current caches to test directory
        const bugsFile = path.join(__dirname, 'bugs-cache.json');
        const issuesFile = path.join(__dirname, 'data', 'cache', 'issues-cache.json');
        
        const testBugsFile = path.join(this.testCacheDir, 'bugs-cache.json');
        const testIssuesFile = path.join(this.testCacheDir, 'issues-cache.json');
        
        if (fs.existsSync(bugsFile)) {
            fs.copyFileSync(bugsFile, testBugsFile);
            console.log(`  ✅ Copied bugs-cache.json to test environment`);
        }
        
        if (fs.existsSync(issuesFile)) {
            fs.copyFileSync(issuesFile, testIssuesFile);
            console.log(`  ✅ Copied issues-cache.json to test environment`);
        }
        
        return {
            testBugsFile,
            testIssuesFile
        };
    }

    // Validate cache file integrity
    validateCacheIntegrity(cacheFile, expectedType = 'issues') {
        try {
            console.log(`🔍 Validating ${expectedType} cache: ${path.basename(cacheFile)}`);
            
            if (!fs.existsSync(cacheFile)) {
                throw new Error(`Cache file does not exist: ${cacheFile}`);
            }
            
            const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            const validation = {
                file: path.basename(cacheFile),
                valid: true,
                issues: []
            };
            
            // Check required structure
            if (expectedType === 'issues' && !cacheData.issues) {
                validation.issues.push('Missing "issues" array');
                validation.valid = false;
            } else if (expectedType === 'bugs' && !cacheData.bugs) {
                validation.issues.push('Missing "bugs" array');
                validation.valid = false;
            }
            
            if (!cacheData.metadata) {
                validation.issues.push('Missing "metadata" object');
            }
            
            if (!cacheData.lastSync) {
                validation.issues.push('Missing "lastSync" timestamp');
            }
            
            // Validate data counts
            const dataArray = expectedType === 'issues' ? cacheData.issues : cacheData.bugs;
            if (dataArray) {
                validation.recordCount = dataArray.length;
                
                // Check for required fields in first few records
                const sampleSize = Math.min(10, dataArray.length);
                const requiredFields = ['key', 'issueType', 'status', 'summary'];
                
                for (let i = 0; i < sampleSize; i++) {
                    const record = dataArray[i];
                    requiredFields.forEach(field => {
                        if (!record.hasOwnProperty(field)) {
                            validation.issues.push(`Record ${i}: Missing required field "${field}"`);
                            validation.valid = false;
                        }
                    });
                }
            }
            
            if (validation.valid) {
                this.validationResults.passed.push(validation);
                console.log(`  ✅ ${validation.file}: Valid (${validation.recordCount} records)`);
            } else {
                this.validationResults.failed.push(validation);
                console.log(`  ❌ ${validation.file}: Invalid - ${validation.issues.join(', ')}`);
            }
            
            return validation;
            
        } catch (error) {
            const validation = {
                file: path.basename(cacheFile),
                valid: false,
                issues: [error.message]
            };
            this.validationResults.failed.push(validation);
            console.log(`  ❌ ${validation.file}: ${error.message}`);
            return validation;
        }
    }

    // Test unified cache creation (dry-run)
    async testUnifiedCacheCreation() {
        console.log('🔄 Testing unified cache creation (dry-run)...');
        
        try {
            const testFiles = this.createTestCacheEnvironment();
            
            // Load both test caches
            const bugsData = JSON.parse(fs.readFileSync(testFiles.testBugsFile, 'utf8'));
            const issuesData = JSON.parse(fs.readFileSync(testFiles.testIssuesFile, 'utf8'));
            
            console.log(`  📊 Current state:
        - Bugs cache: ${bugsData.bugs?.length || 0} bugs
        - Issues cache: ${issuesData.issues?.length || 0} issues 
          (${issuesData.issues?.filter(i => i.issueType === 'Bug').length || 0} bugs, 
           ${issuesData.issues?.filter(i => i.issueType === 'Story').length || 0} stories, 
           ${issuesData.issues?.filter(i => i.issueType === 'Test').length || 0} tests)`);
            
            // Simulate unified cache creation
            const unifiedIssues = [...issuesData.issues];
            const issueKeys = new Set(unifiedIssues.map(i => i.key));
            
            // Check for bugs that exist in bugs-cache but not in issues-cache
            const missingBugs = bugsData.bugs.filter(bug => !issueKeys.has(bug.key));
            
            if (missingBugs.length > 0) {
                console.log(`  ⚠️  Found ${missingBugs.length} bugs in bugs-cache not present in issues-cache:`);
                missingBugs.slice(0, 5).forEach(bug => {
                    console.log(`    - ${bug.key}: ${bug.summary.substring(0, 60)}...`);
                });
                
                this.validationResults.warnings.push({
                    type: 'missingBugs',
                    count: missingBugs.length,
                    samples: missingBugs.slice(0, 3).map(b => b.key)
                });
            }
            
            // Create test unified cache
            const unifiedCache = {
                issues: unifiedIssues,
                metadata: {
                    totalIssues: unifiedIssues.length,
                    issueTypes: ['Bug', 'Story', 'Test'],
                    jiraInstance: issuesData.metadata?.jiraInstance || 'hibob.atlassian.net'
                },
                lastSync: issuesData.lastSync || new Date().toISOString()
            };
            
            // Save test unified cache
            const testUnifiedFile = path.join(this.testCacheDir, 'unified-cache-test.json');
            fs.writeFileSync(testUnifiedFile, JSON.stringify(unifiedCache, null, 2));
            
            // Validate the test unified cache
            const validation = this.validateCacheIntegrity(testUnifiedFile, 'issues');
            
            console.log(`  ✅ Test unified cache created: ${unifiedCache.issues.length} total issues`);
            console.log(`     Breakdown: ${unifiedCache.issues.filter(i => i.issueType === 'Bug').length} bugs, ${unifiedCache.issues.filter(i => i.issueType === 'Story').length} stories, ${unifiedCache.issues.filter(i => i.issueType === 'Test').length} tests`);
            
            return {
                success: validation.valid,
                unifiedCache,
                testFile: testUnifiedFile,
                warnings: missingBugs.length
            };
            
        } catch (error) {
            console.error('❌ Unified cache creation test failed:', error.message);
            this.validationResults.failed.push({
                test: 'unified-cache-creation',
                error: error.message
            });
            return { success: false, error: error.message };
        }
    }

    // Test API endpoints with unified cache
    async testApiEndpointsWithUnifiedCache(testUnifiedFile) {
        console.log('🔗 Testing API simulation with unified cache...');
        
        try {
            const unifiedData = JSON.parse(fs.readFileSync(testUnifiedFile, 'utf8'));
            
            // Simulate /api/bugs-lite endpoint
            const bugsFromUnified = unifiedData.issues.filter(issue => issue.issueType === 'Bug');
            console.log(`  📋 /api/bugs-lite simulation: ${bugsFromUnified.length} bugs`);
            
            // Compare with baseline
            if (this.baseline?.apiEndpoints?.bugsLite?.bugCount) {
                const expectedBugCount = this.baseline.apiEndpoints.bugsLite.bugCount;
                if (bugsFromUnified.length !== expectedBugCount) {
                    this.validationResults.failed.push({
                        test: 'bugs-lite-simulation',
                        expected: expectedBugCount,
                        actual: bugsFromUnified.length,
                        message: `Bug count mismatch: expected ${expectedBugCount}, got ${bugsFromUnified.length}`
                    });
                    console.log(`    ❌ Bug count mismatch: expected ${expectedBugCount}, got ${bugsFromUnified.length}`);
                } else {
                    this.validationResults.passed.push({
                        test: 'bugs-lite-simulation',
                        message: `Bug count matches baseline: ${bugsFromUnified.length}`
                    });
                    console.log(`    ✅ Bug count matches baseline: ${bugsFromUnified.length}`);
                }
            }
            
            // Simulate /api/issues-lite endpoint
            console.log(`  📋 /api/issues-lite simulation: ${unifiedData.issues.length} total issues`);
            
            // Simulate /api/testing-coverage endpoint
            const eligibleStories = unifiedData.issues.filter(issue => {
                if (issue.issueType !== 'Story') return false;
                
                const storyPoints = parseFloat(issue.storyPoints) || 0;
                const isEligiblePoints = storyPoints >= 0.5;
                const isValidStatus = !['Canceled', 'Reject', 'Rejected'].includes(issue.status);
                const isValidTeam = ['MIS - GTM', 'MIS - GTC', 'MIS - CORP', 'MIS - Platform']
                    .includes(issue.leadingTeam);
                
                return isEligiblePoints && isValidStatus && isValidTeam;
            });
            
            const storiesWithTestCases = eligibleStories.filter(story => story.testCaseCreated === 'Yes');
            const coveragePercentage = eligibleStories.length > 0 
                ? Math.round((storiesWithTestCases.length / eligibleStories.length) * 100)
                : 0;
            
            console.log(`  📋 /api/testing-coverage simulation: ${coveragePercentage}% (${storiesWithTestCases.length}/${eligibleStories.length})`);
            
            // Compare with baseline
            if (this.baseline?.kpis?.testingCoverage) {
                const expectedCoverage = this.baseline.kpis.testingCoverage.overallCoverage;
                const expectedTotal = this.baseline.kpis.testingCoverage.totalEligibleStories;
                
                if (Math.abs(coveragePercentage - expectedCoverage) > 1) { // Allow 1% tolerance for rounding
                    this.validationResults.failed.push({
                        test: 'testing-coverage-simulation',
                        expected: expectedCoverage,
                        actual: coveragePercentage,
                        message: `Coverage percentage mismatch: expected ${expectedCoverage}%, got ${coveragePercentage}%`
                    });
                    console.log(`    ❌ Coverage mismatch: expected ${expectedCoverage}%, got ${coveragePercentage}%`);
                } else {
                    this.validationResults.passed.push({
                        test: 'testing-coverage-simulation',
                        message: `Coverage percentage matches baseline: ${coveragePercentage}%`
                    });
                    console.log(`    ✅ Coverage percentage matches baseline: ${coveragePercentage}%`);
                }
                
                if (Math.abs(eligibleStories.length - expectedTotal) > 5) { // Allow small tolerance for data changes
                    this.validationResults.warnings.push({
                        test: 'testing-coverage-count',
                        expected: expectedTotal,
                        actual: eligibleStories.length,
                        message: `Story count difference: expected ~${expectedTotal}, got ${eligibleStories.length}`
                    });
                    console.log(`    ⚠️  Story count difference: expected ~${expectedTotal}, got ${eligibleStories.length}`);
                }
            }
            
            return {
                success: true,
                results: {
                    bugsCount: bugsFromUnified.length,
                    totalIssues: unifiedData.issues.length,
                    testingCoverage: coveragePercentage,
                    eligibleStories: eligibleStories.length
                }
            };
            
        } catch (error) {
            console.error('❌ API endpoint simulation failed:', error.message);
            this.validationResults.failed.push({
                test: 'api-endpoints-simulation',
                error: error.message
            });
            return { success: false, error: error.message };
        }
    }

    // Generate protection report
    generateProtectionReport() {
        console.log('\n🛡️  SYNC PROTECTION REPORT');
        console.log('=' .repeat(50));
        
        console.log(`\n✅ PASSED VALIDATIONS (${this.validationResults.passed.length}):`);
        this.validationResults.passed.forEach(result => {
            console.log(`  • ${result.test || result.file}: ${result.message || 'Valid'}`);
        });
        
        if (this.validationResults.failed.length > 0) {
            console.log(`\n❌ FAILED VALIDATIONS (${this.validationResults.failed.length}):`);
            this.validationResults.failed.forEach(result => {
                console.log(`  • ${result.test || result.file}: ${result.message || result.issues?.join(', ') || result.error}`);
            });
        }
        
        if (this.validationResults.warnings.length > 0) {
            console.log(`\n⚠️  WARNINGS (${this.validationResults.warnings.length}):`);
            this.validationResults.warnings.forEach(result => {
                console.log(`  • ${result.test || result.type}: ${result.message || `${result.count} items`}`);
            });
        }
        
        const allPassed = this.validationResults.failed.length === 0;
        console.log(`\n🎯 MIGRATION SAFETY: ${allPassed ? '✅ SAFE TO PROCEED' : '❌ RESOLVE ISSUES FIRST'}`);
        
        if (!allPassed) {
            console.log('\n🚨 CRITICAL ISSUES DETECTED:');
            console.log('  Migration should NOT proceed until all failed validations are resolved.');
            console.log('  Review the failed validations above and fix any data integrity issues.');
        }
        
        return allPassed;
    }

    // Main execution
    async run() {
        try {
            console.log(`🛡️  Starting Sync Protection (${this.dryRun ? 'DRY-RUN' : 'LIVE'} mode)...\n`);
            
            // Load baseline
            await this.loadBaseline();
            
            // Create backups
            const backups = this.createBackups();
            
            // Validate current cache files
            this.validateCacheIntegrity(path.join(__dirname, 'bugs-cache.json'), 'bugs');
            this.validateCacheIntegrity(path.join(__dirname, 'data', 'cache', 'issues-cache.json'), 'issues');
            
            // Test unified cache creation
            const unifiedTest = await this.testUnifiedCacheCreation();
            
            if (unifiedTest.success) {
                // Test API endpoints with unified cache
                await this.testApiEndpointsWithUnifiedCache(unifiedTest.testFile);
            }
            
            // Generate report
            const safeToProc = this.generateProtectionReport();
            
            console.log(`\n💾 Backups created: ${Object.keys(backups).length} files`);
            console.log(`🧪 Test cache directory: ${this.testCacheDir}`);
            
            return {
                safeToProced: safeToProc,
                backups,
                validationResults: this.validationResults
            };
            
        } catch (error) {
            console.error('\n❌ Sync protection failed:', error);
            throw error;
        }
    }
}

// Run if called directly
if (require.main === module) {
    const protection = new SyncProtection(true); // Always dry-run by default
    protection.run()
        .then(result => {
            console.log(`\n${result.safeToProced ? '🎉' : '⚠️'}  Sync protection completed!`);
            process.exit(result.safeToProced ? 0 : 1);
        })
        .catch(error => {
            console.error('\n💥 Sync protection failed:', error);
            process.exit(1);
        });
}

module.exports = SyncProtection;