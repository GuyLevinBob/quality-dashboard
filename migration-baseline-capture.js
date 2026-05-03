#!/usr/bin/env node

/**
 * KPI Baseline Capture Script
 * 
 * This script captures comprehensive baseline metrics before unified cache migration.
 * It tests all API endpoints and records exact KPI values that must be preserved.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

class BaselineCapture {
    constructor() {
        this.apiBase = 'http://localhost:3002';
        this.baseline = {
            timestamp: new Date().toISOString(),
            cacheFiles: {},
            apiEndpoints: {},
            kpis: {},
            performance: {}
        };
    }

    // Make HTTP request to API
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
                            responseTime,
                            headers: res.headers 
                        });
                    } catch (e) {
                        resolve({ 
                            status: res.statusCode, 
                            data: data, 
                            responseTime,
                            headers: res.headers 
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

    // Capture cache file states
    async captureCacheFiles() {
        console.log('📁 Capturing cache file states...');
        
        // Bugs cache
        const bugsFile = path.join(__dirname, 'bugs-cache.json');
        if (fs.existsSync(bugsFile)) {
            const bugsData = JSON.parse(fs.readFileSync(bugsFile, 'utf8'));
            this.baseline.cacheFiles.bugsCacheJson = {
                path: bugsFile,
                exists: true,
                totalBugs: bugsData.metadata?.totalBugs || bugsData.bugs?.length || 0,
                lastSync: bugsData.lastSync,
                fileSize: fs.statSync(bugsFile).size,
                projects: bugsData.metadata?.projects || [],
                sampleBugKeys: bugsData.bugs?.slice(0, 5).map(b => b.key) || []
            };
        }

        // Issues cache
        const issuesFile = path.join(__dirname, 'data', 'cache', 'issues-cache.json');
        if (fs.existsSync(issuesFile)) {
            const issuesData = JSON.parse(fs.readFileSync(issuesFile, 'utf8'));
            this.baseline.cacheFiles.issuesCacheJson = {
                path: issuesFile,
                exists: true,
                totalIssues: issuesData.metadata?.totalIssues || issuesData.issues?.length || 0,
                issueTypes: issuesData.metadata?.issueTypes || [],
                lastSync: issuesData.lastSync,
                fileSize: fs.statSync(issuesFile).size,
                
                // Count by issue type
                bugCount: issuesData.issues?.filter(i => i.issueType === 'Bug').length || 0,
                storyCount: issuesData.issues?.filter(i => i.issueType === 'Story').length || 0,
                testCount: issuesData.issues?.filter(i => i.issueType === 'Test').length || 0,
                
                sampleIssueKeys: issuesData.issues?.slice(0, 5).map(i => i.key) || []
            };
        }

        console.log(`✅ Cache files captured:
        - Bugs Cache: ${this.baseline.cacheFiles.bugsCacheJson?.totalBugs || 0} bugs
        - Issues Cache: ${this.baseline.cacheFiles.issuesCacheJson?.totalIssues || 0} issues`);
    }

    // Test all API endpoints
    async testApiEndpoints() {
        console.log('🔗 Testing API endpoints...');

        try {
            // Health endpoint
            const health = await this.makeRequest('/health');
            this.baseline.apiEndpoints.health = {
                status: health.status,
                responseTime: health.responseTime,
                data: health.data
            };

            // Bugs lite endpoint
            const bugsLite = await this.makeRequest('/api/bugs-lite');
            this.baseline.apiEndpoints.bugsLite = {
                status: bugsLite.status,
                responseTime: bugsLite.responseTime,
                bugCount: bugsLite.data?.bugs?.length || 0,
                lastSync: bugsLite.data?.lastSync,
                sampleBugKeys: bugsLite.data?.bugs?.slice(0, 3).map(b => b.key) || []
            };

            // Issues lite endpoint (all types)
            const issuesLite = await this.makeRequest('/api/issues-lite?types=Bug,Story,Test');
            this.baseline.apiEndpoints.issuesLite = {
                status: issuesLite.status,
                responseTime: issuesLite.responseTime,
                totalIssues: issuesLite.data?.issues?.length || 0,
                issueTypes: issuesLite.data?.metadata?.issueTypes || [],
                lastSync: issuesLite.data?.lastSync,
                
                // Count by type
                bugCount: issuesLite.data?.issues?.filter(i => i.issueType === 'Bug').length || 0,
                storyCount: issuesLite.data?.issues?.filter(i => i.issueType === 'Story').length || 0,
                testCount: issuesLite.data?.issues?.filter(i => i.issueType === 'Test').length || 0
            };

            // Testing coverage endpoint
            const testingCoverage = await this.makeRequest('/api/testing-coverage');
            this.baseline.apiEndpoints.testingCoverage = {
                status: testingCoverage.status,
                responseTime: testingCoverage.responseTime,
                totalStories: testingCoverage.data?.total || 0,
                storiesWithTestCases: testingCoverage.data?.stories?.filter(s => s.testCaseCreated === 'Yes').length || 0,
                teamBreakdown: testingCoverage.data?.metadata?.teamBreakdown || {},
                testCaseBreakdown: testingCoverage.data?.metadata?.testCaseBreakdown || {},
                filterEfficiency: testingCoverage.data?.metadata?.filtering?.filterEfficiency || '0%'
            };

            console.log(`✅ API endpoints tested:
        - Health: ${health.status} (${health.responseTime}ms)
        - Bugs Lite: ${bugsLite.data?.bugs?.length || 0} bugs (${bugsLite.responseTime}ms)
        - Issues Lite: ${issuesLite.data?.issues?.length || 0} issues (${issuesLite.responseTime}ms)
        - Testing Coverage: ${testingCoverage.data?.total || 0} stories (${testingCoverage.responseTime}ms)`);

        } catch (error) {
            console.error('❌ API endpoint testing failed:', error.message);
            this.baseline.apiEndpoints.error = error.message;
        }
    }

    // Calculate critical KPIs
    async calculateKPIs() {
        console.log('📊 Calculating critical KPIs...');

        const testingData = this.baseline.apiEndpoints.testingCoverage;
        const issuesData = this.baseline.apiEndpoints.issuesLite;

        // Testing Coverage KPIs
        if (testingData?.totalStories && testingData?.storiesWithTestCases) {
            this.baseline.kpis.testingCoverage = {
                totalEligibleStories: testingData.totalStories,
                storiesWithTestCases: testingData.storiesWithTestCases,
                overallCoverage: Math.round((testingData.storiesWithTestCases / testingData.totalStories) * 100),
                teamBreakdown: testingData.teamBreakdown,
                testCaseBreakdown: testingData.testCaseBreakdown,
                filterEfficiency: testingData.filterEfficiency
            };
        }

        // Issue Distribution KPIs
        if (issuesData?.totalIssues) {
            this.baseline.kpis.issueDistribution = {
                totalIssues: issuesData.totalIssues,
                bugCount: issuesData.bugCount,
                storyCount: issuesData.storyCount,
                testCount: issuesData.testCount,
                bugPercentage: Math.round((issuesData.bugCount / issuesData.totalIssues) * 100),
                storyPercentage: Math.round((issuesData.storyCount / issuesData.totalIssues) * 100),
                testPercentage: Math.round((issuesData.testCount / issuesData.totalIssues) * 100)
            };
        }

        // Cache Consistency KPIs
        const bugsInBugCache = this.baseline.cacheFiles.bugsCacheJson?.totalBugs || 0;
        const bugsInIssueCache = this.baseline.cacheFiles.issuesCacheJson?.bugCount || 0;
        
        this.baseline.kpis.cacheConsistency = {
            bugsInBugCache,
            bugsInIssueCache,
            discrepancy: Math.abs(bugsInBugCache - bugsInIssueCache),
            syncTimesMatch: this.baseline.cacheFiles.bugsCacheJson?.lastSync === this.baseline.cacheFiles.issuesCacheJson?.lastSync
        };

        console.log(`✅ KPIs calculated:
        - Testing Coverage: ${this.baseline.kpis.testingCoverage?.overallCoverage || 'N/A'}%
        - Issue Distribution: ${issuesData?.bugCount || 0} bugs, ${issuesData?.storyCount || 0} stories, ${issuesData?.testCount || 0} tests
        - Cache Discrepancy: ${this.baseline.kpis.cacheConsistency?.discrepancy || 0} bugs difference`);
    }

    // Capture performance baselines
    capturePerformanceBaselines() {
        console.log('⚡ Capturing performance baselines...');

        this.baseline.performance = {
            apiResponseTimes: {
                health: this.baseline.apiEndpoints.health?.responseTime || 0,
                bugsLite: this.baseline.apiEndpoints.bugsLite?.responseTime || 0,
                issuesLite: this.baseline.apiEndpoints.issuesLite?.responseTime || 0,
                testingCoverage: this.baseline.apiEndpoints.testingCoverage?.responseTime || 0
            },
            cacheFileSizes: {
                bugsCacheSize: this.baseline.cacheFiles.bugsCacheJson?.fileSize || 0,
                issuesCacheSize: this.baseline.cacheFiles.issuesCacheJson?.fileSize || 0
            }
        };

        console.log(`✅ Performance baselines captured:
        - API response times: ${JSON.stringify(this.baseline.performance.apiResponseTimes)}ms
        - Cache sizes: bugs=${Math.round(this.baseline.performance.cacheFileSizes.bugsCacheSize/1024)}KB, issues=${Math.round(this.baseline.performance.cacheFileSizes.issuesCacheSize/1024)}KB`);
    }

    // Save baseline to file
    saveBaseline() {
        const filename = `baseline-${Date.now()}.json`;
        const filepath = path.join(__dirname, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(this.baseline, null, 2));
        
        console.log(`💾 Baseline saved to: ${filename}`);
        return filepath;
    }

    // Generate baseline report
    generateReport() {
        console.log('\n📋 BASELINE CAPTURE REPORT');
        console.log('=' .repeat(50));
        
        console.log('\n📁 CACHE FILES:');
        const bugsCache = this.baseline.cacheFiles.bugsCacheJson;
        const issuesCache = this.baseline.cacheFiles.issuesCacheJson;
        
        if (bugsCache) {
            console.log(`  • bugs-cache.json: ${bugsCache.totalBugs} bugs (${Math.round(bugsCache.fileSize/1024)}KB)`);
            console.log(`    Last sync: ${bugsCache.lastSync}`);
        }
        
        if (issuesCache) {
            console.log(`  • issues-cache.json: ${issuesCache.totalIssues} issues (${Math.round(issuesCache.fileSize/1024)}KB)`);
            console.log(`    Breakdown: ${issuesCache.bugCount} bugs, ${issuesCache.storyCount} stories, ${issuesCache.testCount} tests`);
            console.log(`    Last sync: ${issuesCache.lastSync}`);
        }

        console.log('\n📊 CRITICAL KPIs:');
        const testingKPIs = this.baseline.kpis.testingCoverage;
        if (testingKPIs) {
            console.log(`  • Testing Coverage: ${testingKPIs.overallCoverage}% (${testingKPIs.storiesWithTestCases}/${testingKPIs.totalEligibleStories} stories)`);
            console.log(`  • Team Breakdown:`);
            Object.entries(testingKPIs.teamBreakdown).forEach(([team, count]) => {
                console.log(`    - ${team}: ${count} stories`);
            });
        }

        const distKPIs = this.baseline.kpis.issueDistribution;
        if (distKPIs) {
            console.log(`  • Issue Distribution: ${distKPIs.bugCount} bugs (${distKPIs.bugPercentage}%), ${distKPIs.storyCount} stories (${distKPIs.storyPercentage}%), ${distKPIs.testCount} tests (${distKPIs.testPercentage}%)`);
        }

        console.log('\n⚠️  CACHE CONSISTENCY:');
        const consistency = this.baseline.kpis.cacheConsistency;
        if (consistency) {
            console.log(`  • Bugs in bug-cache: ${consistency.bugsInBugCache}`);
            console.log(`  • Bugs in issues-cache: ${consistency.bugsInIssueCache}`);
            console.log(`  • Discrepancy: ${consistency.discrepancy} bugs`);
            console.log(`  • Sync times match: ${consistency.syncTimesMatch ? '✅' : '❌'}`);
        }

        console.log('\n⚡ PERFORMANCE:');
        const perf = this.baseline.performance.apiResponseTimes;
        console.log(`  • API Response Times: health=${perf.health}ms, bugs=${perf.bugsLite}ms, issues=${perf.issuesLite}ms, coverage=${perf.testingCoverage}ms`);

        console.log('\n🎯 MIGRATION SUCCESS CRITERIA:');
        console.log('  After migration, these values MUST match exactly:');
        console.log(`  • Total Issues: ${issuesCache?.totalIssues || 'N/A'}`);
        console.log(`  • Testing Coverage: ${testingKPIs?.overallCoverage || 'N/A'}%`);
        console.log(`  • Team Story Counts: ${JSON.stringify(testingKPIs?.teamBreakdown || {})}`);
        console.log(`  • Issue Distribution: ${distKPIs?.bugCount || 'N/A'}/${distKPIs?.storyCount || 'N/A'}/${distKPIs?.testCount || 'N/A'}`);
        console.log(`  • Cache Discrepancy: Should be 0 (currently ${consistency?.discrepancy || 'N/A'})`);
    }

    // Main execution
    async run() {
        try {
            console.log('🎯 Starting KPI Baseline Capture...\n');

            await this.captureCacheFiles();
            await this.testApiEndpoints();
            await this.calculateKPIs();
            this.capturePerformanceBaselines();

            const baselineFile = this.saveBaseline();
            this.generateReport();

            console.log(`\n✅ Baseline capture completed successfully!`);
            console.log(`📄 Baseline data saved to: ${baselineFile}`);
            
            return this.baseline;

        } catch (error) {
            console.error('\n❌ Baseline capture failed:', error);
            throw error;
        }
    }
}

// Run if called directly
if (require.main === module) {
    const capture = new BaselineCapture();
    capture.run()
        .then(() => {
            console.log('\n🎉 Baseline capture finished!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Baseline capture failed:', error);
            process.exit(1);
        });
}

module.exports = BaselineCapture;