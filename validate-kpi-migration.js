#!/usr/bin/env node

/**
 * KPI Migration Validation
 * 
 * This script compares pre and post-migration baselines to ensure
 * all KPIs have been preserved exactly during the unified cache migration.
 */

const fs = require('fs');
const path = require('path');

class KpiMigrationValidator {
    constructor() {
        this.baselineDir = __dirname;
        this.validationResults = {
            critical: { passed: [], failed: [] },
            performance: { passed: [], failed: [] },
            warnings: []
        };
    }

    // Find baseline files
    findBaselineFiles() {
        const baselineFiles = fs.readdirSync(this.baselineDir)
            .filter(f => f.startsWith('baseline-') && f.endsWith('.json'))
            .map(f => ({
                filename: f,
                timestamp: parseInt(f.replace('baseline-', '').replace('.json', '')),
                path: path.join(this.baselineDir, f)
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
        
        if (baselineFiles.length < 2) {
            throw new Error(`Need at least 2 baseline files for comparison. Found: ${baselineFiles.length}`);
        }
        
        // Return first (pre-migration) and last (post-migration)
        return {
            preMigration: baselineFiles[0],
            postMigration: baselineFiles[baselineFiles.length - 1]
        };
    }

    // Load baseline data
    loadBaseline(baselineFile) {
        try {
            const data = fs.readFileSync(baselineFile.path, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            throw new Error(`Failed to load baseline ${baselineFile.filename}: ${error.message}`);
        }
    }

    // Validate critical KPIs (must match exactly)
    validateCriticalKpis(pre, post) {
        console.log('🎯 Validating Critical KPIs...');
        
        const criticalValidations = [
            {
                name: 'Total Issues',
                preValue: pre.cacheFiles?.issuesCacheJson?.totalIssues,
                postValue: post.cacheFiles?.issuesCacheJson?.totalIssues,
                tolerance: 0
            },
            {
                name: 'Bug Count',
                preValue: pre.cacheFiles?.issuesCacheJson?.bugCount,
                postValue: post.cacheFiles?.issuesCacheJson?.bugCount,
                tolerance: 0
            },
            {
                name: 'Story Count',
                preValue: pre.cacheFiles?.issuesCacheJson?.storyCount,
                postValue: post.cacheFiles?.issuesCacheJson?.storyCount,
                tolerance: 0
            },
            {
                name: 'Testing Coverage Percentage',
                preValue: pre.kpis?.testingCoverage?.overallCoverage,
                postValue: post.kpis?.testingCoverage?.overallCoverage,
                tolerance: 0
            },
            {
                name: 'Testing Coverage Total Stories',
                preValue: pre.kpis?.testingCoverage?.totalEligibleStories,
                postValue: post.kpis?.testingCoverage?.totalEligibleStories,
                tolerance: 0
            },
            {
                name: 'Testing Coverage Stories with Test Cases',
                preValue: pre.kpis?.testingCoverage?.storiesWithTestCases,
                postValue: post.kpis?.testingCoverage?.storiesWithTestCases,
                tolerance: 0
            }
        ];

        criticalValidations.forEach(validation => {
            const { name, preValue, postValue, tolerance } = validation;
            
            if (preValue === undefined || postValue === undefined) {
                this.validationResults.warnings.push({
                    type: 'missing-data',
                    message: `${name}: Missing data (pre: ${preValue}, post: ${postValue})`
                });
                console.log(`  ⚠️  ${name}: Missing data`);
                return;
            }
            
            const difference = Math.abs(preValue - postValue);
            const withinTolerance = difference <= tolerance;
            
            const result = {
                name,
                preValue,
                postValue,
                difference,
                tolerance,
                passed: withinTolerance
            };
            
            if (withinTolerance) {
                this.validationResults.critical.passed.push(result);
                console.log(`  ✅ ${name}: ${preValue} → ${postValue} (${difference === 0 ? 'exact match' : `diff: ${difference}`})`);
            } else {
                this.validationResults.critical.failed.push(result);
                console.log(`  ❌ ${name}: ${preValue} → ${postValue} (diff: ${difference}, tolerance: ${tolerance})`);
            }
        });

        // Validate team breakdown
        this.validateTeamBreakdown(pre, post);
    }

    // Validate team breakdown
    validateTeamBreakdown(pre, post) {
        const preTeams = pre.kpis?.testingCoverage?.teamBreakdown || {};
        const postTeams = post.kpis?.testingCoverage?.teamBreakdown || {};
        
        const allTeams = new Set([...Object.keys(preTeams), ...Object.keys(postTeams)]);
        
        allTeams.forEach(team => {
            const preCount = preTeams[team] || 0;
            const postCount = postTeams[team] || 0;
            
            const result = {
                name: `Team ${team}`,
                preValue: preCount,
                postValue: postCount,
                difference: Math.abs(preCount - postCount),
                passed: preCount === postCount
            };
            
            if (result.passed) {
                this.validationResults.critical.passed.push(result);
                console.log(`  ✅ Team ${team}: ${preCount} stories (unchanged)`);
            } else {
                this.validationResults.critical.failed.push(result);
                console.log(`  ❌ Team ${team}: ${preCount} → ${postCount} stories`);
            }
        });
    }

    // Validate performance metrics (allowed some variance)
    validatePerformanceMetrics(pre, post) {
        console.log('\n⚡ Validating Performance Metrics...');
        
        const performanceValidations = [
            {
                name: 'Health API Response Time',
                preValue: pre.performance?.apiResponseTimes?.health,
                postValue: post.performance?.apiResponseTimes?.health,
                tolerance: 50 // 50ms tolerance
            },
            {
                name: 'Bugs Lite API Response Time',
                preValue: pre.performance?.apiResponseTimes?.bugsLite,
                postValue: post.performance?.apiResponseTimes?.bugsLite,
                tolerance: 30
            },
            {
                name: 'Issues Lite API Response Time',
                preValue: pre.performance?.apiResponseTimes?.issuesLite,
                postValue: post.performance?.apiResponseTimes?.issuesLite,
                tolerance: 50
            },
            {
                name: 'Testing Coverage API Response Time',
                preValue: pre.performance?.apiResponseTimes?.testingCoverage,
                postValue: post.performance?.apiResponseTimes?.testingCoverage,
                tolerance: 30
            },
            {
                name: 'Issues Cache File Size',
                preValue: pre.performance?.cacheFileSizes?.issuesCacheSize,
                postValue: post.performance?.cacheFileSizes?.issuesCacheSize,
                tolerance: 100000 // 100KB tolerance
            }
        ];

        performanceValidations.forEach(validation => {
            const { name, preValue, postValue, tolerance } = validation;
            
            if (preValue === undefined || postValue === undefined) {
                this.validationResults.warnings.push({
                    type: 'missing-performance-data',
                    message: `${name}: Missing performance data`
                });
                console.log(`  ⚠️  ${name}: Missing performance data`);
                return;
            }
            
            const difference = Math.abs(preValue - postValue);
            const withinTolerance = difference <= tolerance;
            
            const result = {
                name,
                preValue,
                postValue,
                difference,
                tolerance,
                passed: withinTolerance
            };
            
            if (withinTolerance) {
                this.validationResults.performance.passed.push(result);
                const unit = name.includes('Time') ? 'ms' : (name.includes('Size') ? 'bytes' : '');
                console.log(`  ✅ ${name}: ${preValue}${unit} → ${postValue}${unit} (within tolerance)`);
            } else {
                this.validationResults.performance.failed.push(result);
                console.log(`  ❌ ${name}: ${preValue} → ${postValue} (diff: ${difference}, tolerance: ${tolerance})`);
            }
        });
    }

    // Validate cache consistency
    validateCacheConsistency(pre, post) {
        console.log('\n🔄 Validating Cache Consistency...');
        
        // Pre-migration cache consistency
        const preDiscrepancy = pre.kpis?.cacheConsistency?.discrepancy || 0;
        const postDiscrepancy = post.kpis?.cacheConsistency?.discrepancy || 0;
        
        if (preDiscrepancy === 0 && postDiscrepancy === 0) {
            this.validationResults.critical.passed.push({
                name: 'Cache Consistency',
                preValue: 0,
                postValue: 0,
                passed: true
            });
            console.log('  ✅ Cache Consistency: Perfect (0 discrepancy before and after)');
        } else {
            const result = {
                name: 'Cache Consistency',
                preValue: preDiscrepancy,
                postValue: postDiscrepancy,
                passed: postDiscrepancy <= preDiscrepancy // Should improve or stay same
            };
            
            if (result.passed) {
                this.validationResults.critical.passed.push(result);
                console.log(`  ✅ Cache Consistency: Improved (${preDiscrepancy} → ${postDiscrepancy} discrepancy)`);
            } else {
                this.validationResults.critical.failed.push(result);
                console.log(`  ❌ Cache Consistency: Degraded (${preDiscrepancy} → ${postDiscrepancy} discrepancy)`);
            }
        }
        
        // Check if unified cache architecture is working
        const postUnifiedCache = post.apiEndpoints?.health?.data?.unifiedCache;
        if (postUnifiedCache) {
            console.log('  ✅ Unified Cache Architecture: Active');
            console.log(`    - Total Issues: ${postUnifiedCache.totalIssues}`);
            console.log(`    - Bugs: ${postUnifiedCache.bugs}`);
            console.log(`    - Stories: ${postUnifiedCache.stories}`);
            console.log(`    - Tests: ${postUnifiedCache.tests}`);
        } else {
            this.validationResults.warnings.push({
                type: 'unified-cache-missing',
                message: 'Unified cache info not found in health endpoint'
            });
            console.log('  ⚠️  Unified Cache Architecture: Info not found in health endpoint');
        }
    }

    // Generate final validation report
    generateReport(preBaseline, postBaseline) {
        console.log('\n📊 KPI MIGRATION VALIDATION REPORT');
        console.log('=' .repeat(60));
        
        console.log(`\n📅 BASELINE COMPARISON:`);
        console.log(`  • Pre-Migration:  ${new Date(preBaseline.timestamp).toLocaleString()}`);
        console.log(`  • Post-Migration: ${new Date(postBaseline.timestamp).toLocaleString()}`);
        
        const totalCritical = this.validationResults.critical.passed.length + this.validationResults.critical.failed.length;
        const totalPerformance = this.validationResults.performance.passed.length + this.validationResults.performance.failed.length;
        
        console.log(`\n🎯 CRITICAL KPI VALIDATION:`);
        console.log(`  • Passed: ${this.validationResults.critical.passed.length}/${totalCritical}`);
        console.log(`  • Failed: ${this.validationResults.critical.failed.length}/${totalCritical}`);
        console.log(`  • Success Rate: ${Math.round((this.validationResults.critical.passed.length / totalCritical) * 100)}%`);
        
        console.log(`\n⚡ PERFORMANCE VALIDATION:`);
        console.log(`  • Passed: ${this.validationResults.performance.passed.length}/${totalPerformance}`);
        console.log(`  • Failed: ${this.validationResults.performance.failed.length}/${totalPerformance}`);
        console.log(`  • Success Rate: ${Math.round((this.validationResults.performance.passed.length / totalPerformance) * 100)}%`);
        
        if (this.validationResults.warnings.length > 0) {
            console.log(`\n⚠️  WARNINGS (${this.validationResults.warnings.length}):`);
            this.validationResults.warnings.forEach(warning => {
                console.log(`  • ${warning.message}`);
            });
        }
        
        if (this.validationResults.critical.failed.length > 0) {
            console.log(`\n❌ CRITICAL KPI FAILURES:`);
            this.validationResults.critical.failed.forEach(failure => {
                console.log(`  • ${failure.name}: ${failure.preValue} → ${failure.postValue} (diff: ${failure.difference})`);
            });
        }
        
        if (this.validationResults.performance.failed.length > 0) {
            console.log(`\n🐌 PERFORMANCE DEGRADATIONS:`);
            this.validationResults.performance.failed.forEach(failure => {
                console.log(`  • ${failure.name}: ${failure.preValue} → ${failure.postValue} (diff: ${failure.difference})`);
            });
        }
        
        const criticalSuccess = this.validationResults.critical.failed.length === 0;
        const performanceSuccess = this.validationResults.performance.failed.length === 0;
        
        console.log(`\n🎯 MIGRATION VALIDATION: ${criticalSuccess ? '✅ SUCCESS' : '❌ CRITICAL FAILURES'}`);
        if (!performanceSuccess) {
            console.log(`⚡ PERFORMANCE STATUS: ⚠️  DEGRADED (${this.validationResults.performance.failed.length} issues)`);
        }
        
        return {
            criticalSuccess,
            performanceSuccess,
            overallSuccess: criticalSuccess
        };
    }

    // Main validation process
    async validate() {
        try {
            console.log('🔍 Starting KPI Migration Validation...\n');
            
            // Find baseline files
            const baselineFiles = this.findBaselineFiles();
            console.log(`📁 Found baseline files:`);
            console.log(`  • Pre-Migration:  ${baselineFiles.preMigration.filename} (${new Date(baselineFiles.preMigration.timestamp).toLocaleString()})`);
            console.log(`  • Post-Migration: ${baselineFiles.postMigration.filename} (${new Date(baselineFiles.postMigration.timestamp).toLocaleString()})`);
            
            // Load baselines
            const preBaseline = this.loadBaseline(baselineFiles.preMigration);
            const postBaseline = this.loadBaseline(baselineFiles.postMigration);
            
            // Run validations
            this.validateCriticalKpis(preBaseline, postBaseline);
            this.validatePerformanceMetrics(preBaseline, postBaseline);
            this.validateCacheConsistency(preBaseline, postBaseline);
            
            // Generate report
            const result = this.generateReport(preBaseline, postBaseline);
            
            return result;
            
        } catch (error) {
            console.error('\n❌ KPI validation failed:', error.message);
            throw error;
        }
    }
}

// Run if called directly
if (require.main === module) {
    const validator = new KpiMigrationValidator();
    validator.validate()
        .then(result => {
            console.log(`\n${result.overallSuccess ? '🎉' : '💥'} KPI Migration Validation completed!`);
            process.exit(result.overallSuccess ? 0 : 1);
        })
        .catch(error => {
            console.error('\n💥 KPI Migration Validation failed:', error);
            process.exit(1);
        });
}

module.exports = KpiMigrationValidator;