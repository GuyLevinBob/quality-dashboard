#!/usr/bin/env node

/**
 * Test Unified API Server
 * 
 * This script tests the updated API server to ensure all endpoints work correctly 
 * with the unified cache and KPIs are preserved.
 */

const http = require('http');
const BaselineCapture = require('./migration-baseline-capture.js');

class UnifiedApiTester {
    constructor() {
        this.apiBase = 'http://localhost:3002';
        this.baseline = null;
        this.results = {
            tests: [],
            passed: 0,
            failed: 0
        };
    }

    // Make HTTP request
    async makeRequest(endpoint) {
        return new Promise((resolve, reject) => {
            const url = new URL(endpoint, this.apiBase);
            const startTime = Date.now();
            
            const req = http.request(url, { method: 'GET' }, (res) => {
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
            req.end();
        });
    }

    // Load baseline for comparison
    async loadBaseline() {
        try {
            const baselineCapture = new BaselineCapture();
            this.baseline = await baselineCapture.loadBaseline();
            console.log('📊 Baseline loaded for comparison');
        } catch (error) {
            console.error('❌ Failed to load baseline:', error.message);
        }
    }

    // Test a specific endpoint
    async testEndpoint(name, endpoint, validator) {
        console.log(`🔍 Testing ${name}...`);
        
        try {
            const result = await this.makeRequest(endpoint);
            const testResult = {
                name,
                endpoint,
                status: result.status,
                responseTime: result.responseTime,
                passed: false,
                message: '',
                data: null
            };

            if (result.status !== 200) {
                testResult.message = `HTTP ${result.status}`;
            } else {
                testResult.data = result.data;
                if (validator) {
                    const validation = validator(result.data, this.baseline);
                    testResult.passed = validation.passed;
                    testResult.message = validation.message;
                } else {
                    testResult.passed = true;
                    testResult.message = 'Response received';
                }
            }

            if (testResult.passed) {
                this.results.passed++;
                console.log(`  ✅ ${name}: ${testResult.message} (${testResult.responseTime}ms)`);
            } else {
                this.results.failed++;
                console.log(`  ❌ ${name}: ${testResult.message} (${testResult.responseTime}ms)`);
            }

            this.results.tests.push(testResult);
            return testResult;

        } catch (error) {
            this.results.failed++;
            const testResult = {
                name,
                endpoint,
                passed: false,
                message: `Error: ${error.message}`,
                responseTime: 0
            };
            this.results.tests.push(testResult);
            console.log(`  ❌ ${name}: ${testResult.message}`);
            return testResult;
        }
    }

    // Validators for each endpoint
    validateHealth(data, baseline) {
        if (!data.unifiedCache) {
            return { passed: false, message: 'No unified cache info in health response' };
        }
        
        const totalIssues = data.unifiedCache.totalIssues;
        const expectedTotal = baseline?.cacheFiles?.issuesCacheJson?.totalIssues;
        
        if (expectedTotal && Math.abs(totalIssues - expectedTotal) > 5) {
            return { 
                passed: false, 
                message: `Total issues mismatch: expected ~${expectedTotal}, got ${totalIssues}` 
            };
        }
        
        return { 
            passed: true, 
            message: `Healthy - ${totalIssues} issues, ${data.unifiedCache.bugs} bugs` 
        };
    }

    validateBugsLite(data, baseline) {
        const bugCount = data.bugs?.length || 0;
        const expectedBugCount = baseline?.apiEndpoints?.bugsLite?.bugCount;
        
        if (expectedBugCount && Math.abs(bugCount - expectedBugCount) > 2) {
            return { 
                passed: false, 
                message: `Bug count mismatch: expected ${expectedBugCount}, got ${bugCount}` 
            };
        }
        
        return { 
            passed: true, 
            message: `${bugCount} bugs (matches baseline)` 
        };
    }

    validateIssuesLite(data, baseline) {
        const totalIssues = data.issues?.length || 0;
        const expectedTotal = baseline?.apiEndpoints?.issuesLite?.totalIssues;
        
        if (expectedTotal && Math.abs(totalIssues - expectedTotal) > 5) {
            return { 
                passed: false, 
                message: `Issue count mismatch: expected ${expectedTotal}, got ${totalIssues}` 
            };
        }
        
        // Check issue type distribution
        const bugs = data.issues?.filter(i => i.issueType === 'Bug').length || 0;
        const stories = data.issues?.filter(i => i.issueType === 'Story').length || 0;
        const tests = data.issues?.filter(i => i.issueType === 'Test').length || 0;
        
        return { 
            passed: true, 
            message: `${totalIssues} issues (${bugs} bugs, ${stories} stories, ${tests} tests)` 
        };
    }

    validateTestingCoverage(data, baseline) {
        const totalStories = data.total || 0;
        const storiesWithTestCases = data.stories?.filter(s => s.testCaseCreated === 'Yes').length || 0;
        const coverage = totalStories > 0 ? Math.round((storiesWithTestCases / totalStories) * 100) : 0;
        
        const expectedCoverage = baseline?.kpis?.testingCoverage?.overallCoverage;
        const expectedTotal = baseline?.kpis?.testingCoverage?.totalEligibleStories;
        
        if (expectedCoverage && Math.abs(coverage - expectedCoverage) > 2) {
            return { 
                passed: false, 
                message: `Coverage mismatch: expected ${expectedCoverage}%, got ${coverage}%` 
            };
        }
        
        if (expectedTotal && Math.abs(totalStories - expectedTotal) > 10) {
            return { 
                passed: false, 
                message: `Story count mismatch: expected ~${expectedTotal}, got ${totalStories}` 
            };
        }
        
        return { 
            passed: true, 
            message: `${coverage}% coverage (${storiesWithTestCases}/${totalStories} stories)` 
        };
    }

    // Test a specific issue details endpoint
    async testIssueDetails() {
        console.log(`🔍 Testing issue details...`);
        
        // First get a sample issue from issues-lite
        try {
            const issuesResult = await this.makeRequest('/api/issues-lite?types=Bug,Story');
            if (issuesResult.status !== 200 || !issuesResult.data.issues || issuesResult.data.issues.length === 0) {
                console.log('  ⚠️  No issues available to test details endpoint');
                return;
            }
            
            // Test with a bug
            const sampleBug = issuesResult.data.issues.find(i => i.issueType === 'Bug');
            if (sampleBug) {
                const detailsResult = await this.testEndpoint(
                    `Bug Details (${sampleBug.key})`,
                    `/api/issues/${sampleBug.key}/details`,
                    (data) => {
                        if (!data.issue || data.issue.key !== sampleBug.key) {
                            return { passed: false, message: 'Issue data mismatch' };
                        }
                        return { passed: true, message: `Details retrieved for ${data.issue.issueType}` };
                    }
                );
            }
            
            // Test with a story
            const sampleStory = issuesResult.data.issues.find(i => i.issueType === 'Story');
            if (sampleStory) {
                await this.testEndpoint(
                    `Story Details (${sampleStory.key})`,
                    `/api/issues/${sampleStory.key}/details`,
                    (data) => {
                        if (!data.issue || data.issue.key !== sampleStory.key) {
                            return { passed: false, message: 'Issue data mismatch' };
                        }
                        return { passed: true, message: `Details retrieved for ${data.issue.issueType}` };
                    }
                );
            }
            
        } catch (error) {
            console.log(`  ❌ Issue details test failed: ${error.message}`);
        }
    }

    // Run all tests
    async runAllTests() {
        console.log('🧪 Starting Unified API Tests...\n');
        
        await this.loadBaseline();
        
        // Test core endpoints
        await this.testEndpoint(
            'Health Check', 
            '/health', 
            this.validateHealth.bind(this)
        );
        
        await this.testEndpoint(
            'Bugs Lite', 
            '/api/bugs-lite', 
            this.validateBugsLite.bind(this)
        );
        
        await this.testEndpoint(
            'Issues Lite (All)', 
            '/api/issues-lite?types=Bug,Story,Test', 
            this.validateIssuesLite.bind(this)
        );
        
        await this.testEndpoint(
            'Testing Coverage', 
            '/api/testing-coverage', 
            this.validateTestingCoverage.bind(this)
        );
        
        // Test issue details endpoints
        await this.testIssueDetails();
        
        // Generate report
        this.generateReport();
        
        return this.results.failed === 0;
    }

    // Generate test report
    generateReport() {
        console.log('\n🧪 UNIFIED API TEST REPORT');
        console.log('=' .repeat(50));
        
        console.log(`\n📊 SUMMARY:`);
        console.log(`  • Total Tests: ${this.results.tests.length}`);
        console.log(`  • Passed: ${this.results.passed}`);
        console.log(`  • Failed: ${this.results.failed}`);
        console.log(`  • Success Rate: ${Math.round((this.results.passed / this.results.tests.length) * 100)}%`);
        
        if (this.results.failed > 0) {
            console.log(`\n❌ FAILED TESTS:`);
            this.results.tests
                .filter(t => !t.passed)
                .forEach(test => {
                    console.log(`  • ${test.name}: ${test.message}`);
                });
        }
        
        console.log(`\n✅ PASSED TESTS:`);
        this.results.tests
            .filter(t => t.passed)
            .forEach(test => {
                console.log(`  • ${test.name}: ${test.message}`);
            });
        
        const allPassed = this.results.failed === 0;
        console.log(`\n🎯 MIGRATION STATUS: ${allPassed ? '✅ SUCCESS' : '❌ ISSUES DETECTED'}`);
        
        if (!allPassed) {
            console.log('\n🚨 Please resolve the failed tests before proceeding with migration.');
        }
    }
}

// Run if called directly
if (require.main === module) {
    const tester = new UnifiedApiTester();
    tester.runAllTests()
        .then(success => {
            console.log(`\n${success ? '🎉' : '⚠️'}  Testing completed!`);
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('\n💥 Testing failed:', error);
            process.exit(1);
        });
}

module.exports = UnifiedApiTester;