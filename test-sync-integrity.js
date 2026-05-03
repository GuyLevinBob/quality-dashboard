#!/usr/bin/env node

/**
 * Test Sync Integrity with Unified Cache
 * 
 * This script tests that sync operations maintain unified cache integrity,
 * preserving all issue types (bugs, stories, tests) correctly.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

class SyncIntegrityTester {
    constructor() {
        this.apiBase = 'http://localhost:3002';
        this.unifiedCacheFile = path.join(__dirname, 'data', 'cache', 'issues-cache.json');
        this.testResults = {
            tests: [],
            passed: 0,
            failed: 0
        };
    }

    // Make HTTP request
    async makeRequest(endpoint, method = 'GET', body = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(endpoint, this.apiBase);
            const startTime = Date.now();
            
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            const req = http.request(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const responseTime = Date.now() - startTime;
                    try {
                        const parsed = JSON.parse(data);
                        resolve({ 
                            status: res.statusCode, 
                            data: parsed, 
                            responseTime 
                        });
                    } catch (e) {
                        resolve({ 
                            status: res.statusCode, 
                            data: data, 
                            responseTime 
                        });
                    }
                });
            });

            req.on('error', reject);
            
            if (body) {
                req.write(JSON.stringify(body));
            }
            
            req.end();
        });
    }

    // Read current unified cache state
    readUnifiedCache() {
        try {
            if (!fs.existsSync(this.unifiedCacheFile)) {
                return null;
            }
            return JSON.parse(fs.readFileSync(this.unifiedCacheFile, 'utf8'));
        } catch (error) {
            console.error('❌ Error reading unified cache:', error);
            return null;
        }
    }

    // Create backup of unified cache
    createBackup() {
        const timestamp = Date.now();
        const backupFile = path.join(__dirname, `test-cache-backup-${timestamp}.json`);
        
        if (fs.existsSync(this.unifiedCacheFile)) {
            fs.copyFileSync(this.unifiedCacheFile, backupFile);
            console.log(`💾 Created backup: ${path.basename(backupFile)}`);
            return backupFile;
        }
        return null;
    }

    // Restore from backup
    restoreFromBackup(backupFile) {
        if (fs.existsSync(backupFile)) {
            fs.copyFileSync(backupFile, this.unifiedCacheFile);
            console.log(`🔄 Restored from backup: ${path.basename(backupFile)}`);
            return true;
        }
        return false;
    }

    // Test function wrapper
    async runTest(name, testFunction) {
        console.log(`🧪 Testing ${name}...`);
        
        try {
            const result = await testFunction();
            
            if (result.passed) {
                this.testResults.passed++;
                console.log(`  ✅ ${name}: ${result.message}`);
            } else {
                this.testResults.failed++;
                console.log(`  ❌ ${name}: ${result.message}`);
            }
            
            this.testResults.tests.push({
                name,
                passed: result.passed,
                message: result.message,
                details: result.details
            });
            
            return result.passed;
            
        } catch (error) {
            this.testResults.failed++;
            console.log(`  ❌ ${name}: ${error.message}`);
            this.testResults.tests.push({
                name,
                passed: false,
                message: error.message
            });
            return false;
        }
    }

    // Test: Cache integrity before any sync operations
    async testPreSyncIntegrity() {
        return await this.runTest('Pre-Sync Cache Integrity', async () => {
            const cacheData = this.readUnifiedCache();
            
            if (!cacheData) {
                return { 
                    passed: false, 
                    message: 'No unified cache found' 
                };
            }
            
            const totalIssues = cacheData.issues?.length || 0;
            const bugs = cacheData.issues?.filter(i => i.issueType === 'Bug').length || 0;
            const stories = cacheData.issues?.filter(i => i.issueType === 'Story').length || 0;
            const tests = cacheData.issues?.filter(i => i.issueType === 'Test').length || 0;
            
            return {
                passed: true,
                message: `${totalIssues} issues (${bugs} bugs, ${stories} stories, ${tests} tests)`,
                details: { totalIssues, bugs, stories, tests }
            };
        });
    }

    // Test: Dry-run incremental sync doesn't break data
    async testIncrementalSyncIntegrity() {
        return await this.runTest('Incremental Sync Integrity', async () => {
            const preSyncCache = this.readUnifiedCache();
            const preBugs = preSyncCache.issues?.filter(i => i.issueType === 'Bug').length || 0;
            const preStories = preSyncCache.issues?.filter(i => i.issueType === 'Story').length || 0;
            const preTests = preSyncCache.issues?.filter(i => i.issueType === 'Test').length || 0;
            
            // Simulate incremental sync with a recent timestamp (should sync few/no bugs)
            const since = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
            
            const syncResult = await this.makeRequest('/api/sync', 'POST', { since });
            
            if (syncResult.status !== 200) {
                return {
                    passed: false,
                    message: `Sync failed with status ${syncResult.status}`
                };
            }
            
            // Check cache after sync
            const postSyncCache = this.readUnifiedCache();
            const postBugs = postSyncCache.issues?.filter(i => i.issueType === 'Bug').length || 0;
            const postStories = postSyncCache.issues?.filter(i => i.issueType === 'Story').length || 0;
            const postTests = postSyncCache.issues?.filter(i => i.issueType === 'Test').length || 0;
            
            // Stories and tests should remain exactly the same
            if (postStories !== preStories || postTests !== preTests) {
                return {
                    passed: false,
                    message: `Non-bug data changed! Stories: ${preStories}→${postStories}, Tests: ${preTests}→${postTests}`
                };
            }
            
            // Bugs might change slightly (new/updated bugs)
            const bugsProcessed = syncResult.data.bugsProcessed || 0;
            
            return {
                passed: true,
                message: `Integrity preserved: ${postStories} stories, ${postTests} tests unchanged, ${bugsProcessed} bugs processed`,
                details: { 
                    preBugs, postBugs, 
                    storiesPreserved: postStories === preStories,
                    testsPreserved: postTests === preTests
                }
            };
        });
    }

    // Test: API endpoints still work after sync
    async testPostSyncApiIntegrity() {
        return await this.runTest('Post-Sync API Integrity', async () => {
            // Test key endpoints
            const healthResult = await this.makeRequest('/health');
            const bugsResult = await this.makeRequest('/api/bugs-lite');
            const issuesResult = await this.makeRequest('/api/issues-lite?types=Bug,Story,Test');
            const coverageResult = await this.makeRequest('/api/testing-coverage');
            
            const errors = [];
            
            if (healthResult.status !== 200) errors.push('Health endpoint failed');
            if (bugsResult.status !== 200) errors.push('Bugs lite endpoint failed');
            if (issuesResult.status !== 200) errors.push('Issues lite endpoint failed');
            if (coverageResult.status !== 200) errors.push('Testing coverage endpoint failed');
            
            if (errors.length > 0) {
                return {
                    passed: false,
                    message: `API errors: ${errors.join(', ')}`
                };
            }
            
            // Check data consistency
            const unifiedCacheData = this.readUnifiedCache();
            const healthBugs = healthResult.data.unifiedCache?.bugs || 0;
            const bugsLiteBugs = bugsResult.data.bugs?.length || 0;
            const issuesLiteTotal = issuesResult.data.issues?.length || 0;
            const cacheTotal = unifiedCacheData.issues?.length || 0;
            
            if (healthBugs !== bugsLiteBugs) {
                return {
                    passed: false,
                    message: `Bug count mismatch: health=${healthBugs}, bugs-lite=${bugsLiteBugs}`
                };
            }
            
            if (issuesLiteTotal !== cacheTotal) {
                return {
                    passed: false,
                    message: `Total issue mismatch: issues-lite=${issuesLiteTotal}, cache=${cacheTotal}`
                };
            }
            
            return {
                passed: true,
                message: `All endpoints working: ${healthBugs} bugs, ${issuesLiteTotal} total issues`,
                details: { healthBugs, bugsLiteBugs, issuesLiteTotal, cacheTotal }
            };
        });
    }

    // Test: Testing coverage KPIs are preserved
    async testKpiPreservation() {
        return await this.runTest('KPI Preservation', async () => {
            const coverageResult = await this.makeRequest('/api/testing-coverage');
            
            if (coverageResult.status !== 200) {
                return {
                    passed: false,
                    message: 'Testing coverage endpoint failed'
                };
            }
            
            const totalStories = coverageResult.data.total || 0;
            const storiesWithTestCases = coverageResult.data.stories?.filter(s => s.testCaseCreated === 'Yes').length || 0;
            const coverage = totalStories > 0 ? Math.round((storiesWithTestCases / totalStories) * 100) : 0;
            
            // Check team breakdown
            const teamBreakdown = coverageResult.data.metadata?.teamBreakdown || {};
            const expectedTeams = ['MIS - CORP', 'MIS - GTC', 'MIS - GTM', 'MIS - Platform'];
            const missingTeams = expectedTeams.filter(team => !teamBreakdown[team]);
            
            if (missingTeams.length > 0) {
                return {
                    passed: false,
                    message: `Missing team data: ${missingTeams.join(', ')}`
                };
            }
            
            // Basic sanity checks
            if (totalStories < 800 || totalStories > 1000) {
                return {
                    passed: false,
                    message: `Unexpected story count: ${totalStories} (expected ~871)`
                };
            }
            
            if (coverage < 30 || coverage > 40) {
                return {
                    passed: false,
                    message: `Unexpected coverage: ${coverage}% (expected ~34%)`
                };
            }
            
            return {
                passed: true,
                message: `KPIs preserved: ${coverage}% coverage (${storiesWithTestCases}/${totalStories} stories)`,
                details: { coverage, totalStories, storiesWithTestCases, teamBreakdown }
            };
        });
    }

    // Generate final report
    generateReport() {
        console.log('\n🧪 SYNC INTEGRITY TEST REPORT');
        console.log('=' .repeat(50));
        
        console.log(`\n📊 SUMMARY:`);
        console.log(`  • Total Tests: ${this.testResults.tests.length}`);
        console.log(`  • Passed: ${this.testResults.passed}`);
        console.log(`  • Failed: ${this.testResults.failed}`);
        console.log(`  • Success Rate: ${Math.round((this.testResults.passed / this.testResults.tests.length) * 100)}%`);
        
        if (this.testResults.failed > 0) {
            console.log(`\n❌ FAILED TESTS:`);
            this.testResults.tests
                .filter(t => !t.passed)
                .forEach(test => {
                    console.log(`  • ${test.name}: ${test.message}`);
                });
        }
        
        console.log(`\n✅ PASSED TESTS:`);
        this.testResults.tests
            .filter(t => t.passed)
            .forEach(test => {
                console.log(`  • ${test.name}: ${test.message}`);
            });
        
        const allPassed = this.testResults.failed === 0;
        console.log(`\n🎯 SYNC INTEGRITY: ${allPassed ? '✅ MAINTAINED' : '❌ COMPROMISED'}`);
        
        return allPassed;
    }

    // Main test runner
    async runAllTests() {
        console.log('🔄 Starting Sync Integrity Tests...\n');
        
        // Create backup before testing
        const backupFile = this.createBackup();
        
        try {
            // Run all tests
            await this.testPreSyncIntegrity();
            await this.testIncrementalSyncIntegrity();
            await this.testPostSyncApiIntegrity();
            await this.testKpiPreservation();
            
            // Generate report
            const success = this.generateReport();
            
            console.log(`\n💾 Backup file: ${backupFile ? path.basename(backupFile) : 'None created'}`);
            
            return success;
            
        } catch (error) {
            console.error('\n❌ Test execution failed:', error);
            
            // Restore from backup if something went wrong
            if (backupFile) {
                console.log('🔄 Restoring from backup due to error...');
                this.restoreFromBackup(backupFile);
            }
            
            throw error;
        }
    }
}

// Run if called directly
if (require.main === module) {
    const tester = new SyncIntegrityTester();
    tester.runAllTests()
        .then(success => {
            console.log(`\n${success ? '🎉' : '⚠️'}  Sync integrity testing completed!`);
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('\n💥 Sync integrity testing failed:', error);
            process.exit(1);
        });
}

module.exports = SyncIntegrityTester;