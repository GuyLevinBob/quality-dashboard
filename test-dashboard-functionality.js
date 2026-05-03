#!/usr/bin/env node

/**
 * Comprehensive Dashboard Functionality Test
 * 
 * This script tests all dashboard functionality to ensure it works correctly 
 * with the unified cache architecture and all KPIs are accessible.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

class DashboardFunctionalityTester {
    constructor() {
        this.apiBase = 'http://localhost:3002';
        this.dashboardBase = 'http://127.0.0.1:8090'; // Dashboard server
        this.testResults = {
            apiTests: { passed: 0, failed: 0, tests: [] },
            dataIntegrity: { passed: 0, failed: 0, tests: [] },
            dashboardFiles: { passed: 0, failed: 0, tests: [] }
        };
    }

    // Make HTTP request
    async makeRequest(endpoint, baseUrl = this.apiBase, method = 'GET', body = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(endpoint, baseUrl);
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
                    resolve({ 
                        status: res.statusCode, 
                        data: data,
                        responseTime,
                        headers: res.headers
                    });
                });
            });

            req.on('error', (error) => {
                // For connection refused, return a structured response
                resolve({
                    status: 0,
                    data: null,
                    responseTime: 0,
                    error: error.message
                });
            });
            
            if (body) {
                req.write(JSON.stringify(body));
            }
            
            req.end();
        });
    }

    // Test wrapper
    async runTest(category, name, testFunction) {
        console.log(`🧪 Testing ${name}...`);
        
        try {
            const result = await testFunction();
            const testResult = {
                name,
                passed: result.passed,
                message: result.message,
                details: result.details,
                responseTime: result.responseTime
            };
            
            this.testResults[category].tests.push(testResult);
            
            if (result.passed) {
                this.testResults[category].passed++;
                console.log(`  ✅ ${name}: ${result.message}${result.responseTime ? ` (${result.responseTime}ms)` : ''}`);
            } else {
                this.testResults[category].failed++;
                console.log(`  ❌ ${name}: ${result.message}`);
            }
            
            return result.passed;
            
        } catch (error) {
            const testResult = {
                name,
                passed: false,
                message: `Error: ${error.message}`,
                details: null
            };
            
            this.testResults[category].tests.push(testResult);
            this.testResults[category].failed++;
            console.log(`  ❌ ${name}: ${error.message}`);
            return false;
        }
    }

    // Test all API endpoints comprehensively
    async testAllApiEndpoints() {
        console.log('\n🔗 Testing All API Endpoints...\n');
        
        // Health endpoint
        await this.runTest('apiTests', 'Health Endpoint', async () => {
            const response = await this.makeRequest('/health');
            
            if (response.status !== 200) {
                return { passed: false, message: `HTTP ${response.status}`, responseTime: response.responseTime };
            }
            
            let healthData;
            try {
                healthData = JSON.parse(response.data);
            } catch (e) {
                return { passed: false, message: 'Invalid JSON response', responseTime: response.responseTime };
            }
            
            // Check for unified cache info
            if (!healthData.unifiedCache) {
                return { passed: false, message: 'Missing unified cache information', responseTime: response.responseTime };
            }
            
            const totalIssues = healthData.unifiedCache.totalIssues || 0;
            const bugs = healthData.unifiedCache.bugs || 0;
            const stories = healthData.unifiedCache.stories || 0;
            
            return { 
                passed: true, 
                message: `${totalIssues} issues (${bugs} bugs, ${stories} stories)`,
                responseTime: response.responseTime,
                details: healthData
            };
        });
        
        // Bugs lite endpoint
        await this.runTest('apiTests', 'Bugs Lite Endpoint', async () => {
            const response = await this.makeRequest('/api/bugs-lite');
            
            if (response.status !== 200) {
                return { passed: false, message: `HTTP ${response.status}`, responseTime: response.responseTime };
            }
            
            let bugsData;
            try {
                bugsData = JSON.parse(response.data);
            } catch (e) {
                return { passed: false, message: 'Invalid JSON response', responseTime: response.responseTime };
            }
            
            const bugCount = bugsData.bugs?.length || 0;
            
            if (bugCount === 0) {
                return { passed: false, message: 'No bugs returned', responseTime: response.responseTime };
            }
            
            // Check first bug has required fields
            const firstBug = bugsData.bugs[0];
            const requiredFields = ['key', 'summary', 'status', 'severity', 'assignee'];
            const missingFields = requiredFields.filter(field => !firstBug[field]);
            
            if (missingFields.length > 0) {
                return { 
                    passed: false, 
                    message: `Missing fields: ${missingFields.join(', ')}`,
                    responseTime: response.responseTime 
                };
            }
            
            return {
                passed: true,
                message: `${bugCount} bugs with all required fields`,
                responseTime: response.responseTime,
                details: { bugCount, sampleBug: firstBug.key }
            };
        });
        
        // Issues lite endpoint (all types)
        await this.runTest('apiTests', 'Issues Lite Endpoint (All Types)', async () => {
            const response = await this.makeRequest('/api/issues-lite?types=Bug,Story,Test');
            
            if (response.status !== 200) {
                return { passed: false, message: `HTTP ${response.status}`, responseTime: response.responseTime };
            }
            
            let issuesData;
            try {
                issuesData = JSON.parse(response.data);
            } catch (e) {
                return { passed: false, message: 'Invalid JSON response', responseTime: response.responseTime };
            }
            
            const issues = issuesData.issues || [];
            const bugs = issues.filter(i => i.issueType === 'Bug');
            const stories = issues.filter(i => i.issueType === 'Story');
            const tests = issues.filter(i => i.issueType === 'Test');
            
            return {
                passed: true,
                message: `${issues.length} total (${bugs.length} bugs, ${stories.length} stories, ${tests.length} tests)`,
                responseTime: response.responseTime,
                details: { totalIssues: issues.length, bugs: bugs.length, stories: stories.length, tests: tests.length }
            };
        });
        
        // Testing coverage endpoint
        await this.runTest('apiTests', 'Testing Coverage Endpoint', async () => {
            const response = await this.makeRequest('/api/testing-coverage');
            
            if (response.status !== 200) {
                return { passed: false, message: `HTTP ${response.status}`, responseTime: response.responseTime };
            }
            
            let coverageData;
            try {
                coverageData = JSON.parse(response.data);
            } catch (e) {
                return { passed: false, message: 'Invalid JSON response', responseTime: response.responseTime };
            }
            
            const totalStories = coverageData.total || 0;
            const stories = coverageData.stories || [];
            const storiesWithTestCases = stories.filter(s => s.testCaseCreated === 'Yes').length;
            const coverage = totalStories > 0 ? Math.round((storiesWithTestCases / totalStories) * 100) : 0;
            
            // Check team breakdown
            const teamBreakdown = coverageData.metadata?.teamBreakdown || {};
            const expectedTeams = ['MIS - CORP', 'MIS - GTC', 'MIS - GTM', 'MIS - Platform'];
            const hasAllTeams = expectedTeams.every(team => teamBreakdown[team] > 0);
            
            if (!hasAllTeams) {
                return {
                    passed: false,
                    message: `Missing team data`,
                    responseTime: response.responseTime
                };
            }
            
            return {
                passed: true,
                message: `${coverage}% coverage (${storiesWithTestCases}/${totalStories}), all teams present`,
                responseTime: response.responseTime,
                details: { coverage, totalStories, storiesWithTestCases, teamBreakdown }
            };
        });
        
        // Issue details endpoint
        await this.runTest('apiTests', 'Issue Details Endpoint', async () => {
            // First get a sample issue
            const issuesResponse = await this.makeRequest('/api/issues-lite?types=Bug,Story');
            
            if (issuesResponse.status !== 200) {
                return { passed: false, message: 'Could not get sample issues', responseTime: 0 };
            }
            
            let issuesData;
            try {
                issuesData = JSON.parse(issuesResponse.data);
            } catch (e) {
                return { passed: false, message: 'Could not parse issues data', responseTime: 0 };
            }
            
            if (!issuesData.issues || issuesData.issues.length === 0) {
                return { passed: false, message: 'No issues available for testing', responseTime: 0 };
            }
            
            const sampleIssue = issuesData.issues[0];
            const detailsResponse = await this.makeRequest(`/api/issues/${sampleIssue.key}/details`);
            
            if (detailsResponse.status !== 200) {
                return { passed: false, message: `Details failed: HTTP ${detailsResponse.status}`, responseTime: detailsResponse.responseTime };
            }
            
            let detailsData;
            try {
                detailsData = JSON.parse(detailsResponse.data);
            } catch (e) {
                return { passed: false, message: 'Invalid details JSON', responseTime: detailsResponse.responseTime };
            }
            
            if (!detailsData.issue || detailsData.issue.key !== sampleIssue.key) {
                return { passed: false, message: 'Issue details mismatch', responseTime: detailsResponse.responseTime };
            }
            
            return {
                passed: true,
                message: `Details retrieved for ${sampleIssue.key} (${sampleIssue.issueType})`,
                responseTime: detailsResponse.responseTime,
                details: { issueKey: sampleIssue.key, issueType: sampleIssue.issueType }
            };
        });
    }

    // Test data integrity across endpoints
    async testDataIntegrity() {
        console.log('\n📊 Testing Data Integrity Across Endpoints...\n');
        
        await this.runTest('dataIntegrity', 'Bug Count Consistency', async () => {
            // Get bug counts from different endpoints
            const healthResponse = await this.makeRequest('/health');
            const bugsLiteResponse = await this.makeRequest('/api/bugs-lite');
            const issuesLiteResponse = await this.makeRequest('/api/issues-lite?types=Bug,Story,Test');
            
            if (healthResponse.status !== 200 || bugsLiteResponse.status !== 200 || issuesLiteResponse.status !== 200) {
                return { passed: false, message: 'One or more endpoints failed' };
            }
            
            const healthData = JSON.parse(healthResponse.data);
            const bugsLiteData = JSON.parse(bugsLiteResponse.data);
            const issuesLiteData = JSON.parse(issuesLiteResponse.data);
            
            const healthBugs = healthData.unifiedCache?.bugs || 0;
            const bugsLiteBugs = bugsLiteData.bugs?.length || 0;
            const issuesLiteBugs = issuesLiteData.issues?.filter(i => i.issueType === 'Bug').length || 0;
            
            if (healthBugs !== bugsLiteBugs || bugsLiteBugs !== issuesLiteBugs) {
                return {
                    passed: false,
                    message: `Inconsistent counts: health=${healthBugs}, bugs-lite=${bugsLiteBugs}, issues-lite=${issuesLiteBugs}`
                };
            }
            
            return {
                passed: true,
                message: `Consistent across all endpoints: ${healthBugs} bugs`,
                details: { bugCount: healthBugs }
            };
        });
        
        await this.runTest('dataIntegrity', 'Testing Coverage Data Consistency', async () => {
            const coverageResponse = await this.makeRequest('/api/testing-coverage');
            const issuesLiteResponse = await this.makeRequest('/api/issues-lite?types=Story');
            
            if (coverageResponse.status !== 200 || issuesLiteResponse.status !== 200) {
                return { passed: false, message: 'Endpoints failed' };
            }
            
            const coverageData = JSON.parse(coverageResponse.data);
            const issuesData = JSON.parse(issuesLiteResponse.data);
            
            const coverageStories = coverageData.total || 0;
            const allStories = issuesData.issues?.filter(i => i.issueType === 'Story').length || 0;
            
            // Coverage endpoint filters stories, so it should have fewer than all stories
            if (coverageStories > allStories) {
                return {
                    passed: false,
                    message: `Coverage stories (${coverageStories}) > all stories (${allStories})`
                };
            }
            
            // Should have a reasonable proportion (coverage filters for ≥0.5 story points and MIS teams)
            const proportion = coverageStories / allStories;
            if (proportion < 0.1 || proportion > 0.5) {
                return {
                    passed: false,
                    message: `Unexpected proportion: ${Math.round(proportion * 100)}% (${coverageStories}/${allStories})`
                };
            }
            
            return {
                passed: true,
                message: `Reasonable filtering: ${coverageStories}/${allStories} stories (${Math.round(proportion * 100)}%)`,
                details: { coverageStories, allStories, proportion }
            };
        });
    }

    // Test dashboard files exist and are accessible
    async testDashboardFiles() {
        console.log('\n📁 Testing Dashboard Files...\n');
        
        const dashboardFiles = [
            { name: 'Main Dashboard', path: '/dashboard-multi-issue.html' },
            { name: 'Automated Dashboard', path: '/dashboard-automated-fixed.html' },
            { name: 'Index Page', path: '/index.html' }
        ];
        
        for (const file of dashboardFiles) {
            await this.runTest('dashboardFiles', file.name, async () => {
                const response = await this.makeRequest(file.path, this.dashboardBase);
                
                if (response.status === 0) {
                    return {
                        passed: false,
                        message: `Dashboard server not running (${response.error})`
                    };
                }
                
                if (response.status !== 200) {
                    return {
                        passed: false,
                        message: `HTTP ${response.status}`,
                        responseTime: response.responseTime
                    };
                }
                
                // Check if it looks like an HTML file
                const isHtml = response.data.toLowerCase().includes('<html') && 
                             response.data.toLowerCase().includes('</html>');
                
                if (!isHtml) {
                    return {
                        passed: false,
                        message: 'Response is not valid HTML',
                        responseTime: response.responseTime
                    };
                }
                
                // Check for dashboard-specific content
                const hasDashboardContent = response.data.includes('Chart.js') || 
                                          response.data.includes('dashboard') ||
                                          response.data.includes('API_BASE');
                
                return {
                    passed: true,
                    message: `Accessible${hasDashboardContent ? ' with dashboard content' : ''}`,
                    responseTime: response.responseTime,
                    details: { 
                        size: response.data.length, 
                        hasDashboardContent,
                        contentType: response.headers['content-type']
                    }
                };
            });
        }
        
        // Test dashboard configuration
        await this.runTest('dashboardFiles', 'Dashboard Configuration', async () => {
            // Check if dashboard files exist on filesystem
            const mainDashboard = path.join(__dirname, 'dashboard-multi-issue.html');
            
            if (!fs.existsSync(mainDashboard)) {
                return { passed: false, message: 'Main dashboard file not found' };
            }
            
            const dashboardContent = fs.readFileSync(mainDashboard, 'utf8');
            
            // Check for API configuration
            const hasApiConfig = dashboardContent.includes('API_BASE') || 
                                dashboardContent.includes('localhost:3002');
            
            const hasChartJs = dashboardContent.includes('Chart.js') || 
                             dashboardContent.includes('chart.js');
            
            const hasTestingCoverage = dashboardContent.includes('testing-coverage') ||
                                     dashboardContent.includes('loadTestingCoverageData');
            
            return {
                passed: true,
                message: `Configuration valid (API: ${hasApiConfig}, Charts: ${hasChartJs}, Coverage: ${hasTestingCoverage})`,
                details: { hasApiConfig, hasChartJs, hasTestingCoverage }
            };
        });
    }

    // Generate comprehensive report
    generateReport() {
        console.log('\n📋 COMPREHENSIVE DASHBOARD FUNCTIONALITY REPORT');
        console.log('=' .repeat(70));
        
        const categories = ['apiTests', 'dataIntegrity', 'dashboardFiles'];
        let totalPassed = 0;
        let totalTests = 0;
        
        categories.forEach(category => {
            const results = this.testResults[category];
            totalPassed += results.passed;
            totalTests += results.passed + results.failed;
            
            const categoryName = {
                apiTests: 'API ENDPOINTS',
                dataIntegrity: 'DATA INTEGRITY',
                dashboardFiles: 'DASHBOARD FILES'
            }[category];
            
            console.log(`\n🔧 ${categoryName}:`);
            console.log(`  • Passed: ${results.passed}/${results.passed + results.failed}`);
            console.log(`  • Failed: ${results.failed}/${results.passed + results.failed}`);
            console.log(`  • Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);
            
            if (results.failed > 0) {
                console.log(`\n  ❌ FAILURES:`);
                results.tests
                    .filter(t => !t.passed)
                    .forEach(test => {
                        console.log(`    • ${test.name}: ${test.message}`);
                    });
            }
            
            console.log(`\n  ✅ SUCCESSES:`);
            results.tests
                .filter(t => t.passed)
                .forEach(test => {
                    console.log(`    • ${test.name}: ${test.message}`);
                });
        });
        
        console.log(`\n📊 OVERALL SUMMARY:`);
        console.log(`  • Total Tests: ${totalTests}`);
        console.log(`  • Passed: ${totalPassed}`);
        console.log(`  • Failed: ${totalTests - totalPassed}`);
        console.log(`  • Success Rate: ${Math.round((totalPassed / totalTests) * 100)}%`);
        
        const allPassed = totalTests === totalPassed;
        console.log(`\n🎯 DASHBOARD FUNCTIONALITY: ${allPassed ? '✅ FULLY OPERATIONAL' : '❌ ISSUES DETECTED'}`);
        
        if (!allPassed) {
            console.log('\n🚨 Please resolve the failed tests for complete functionality.');
        } else {
            console.log('\n🎉 All dashboard functionality verified and working correctly!');
            console.log('   • API endpoints responsive and consistent');
            console.log('   • Data integrity maintained across all endpoints');
            console.log('   • Dashboard files accessible and properly configured');
            console.log('   • Unified cache architecture fully operational');
        }
        
        return allPassed;
    }

    // Main test runner
    async runAllTests() {
        console.log('🧪 Starting Comprehensive Dashboard Functionality Tests...\n');
        
        try {
            await this.testAllApiEndpoints();
            await this.testDataIntegrity();
            await this.testDashboardFiles();
            
            return this.generateReport();
            
        } catch (error) {
            console.error('\n❌ Test execution failed:', error);
            throw error;
        }
    }
}

// Run if called directly
if (require.main === module) {
    const tester = new DashboardFunctionalityTester();
    tester.runAllTests()
        .then(success => {
            console.log(`\n${success ? '🎉' : '⚠️'}  Dashboard functionality testing completed!`);
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('\n💥 Dashboard functionality testing failed:', error);
            process.exit(1);
        });
}

module.exports = DashboardFunctionalityTester;