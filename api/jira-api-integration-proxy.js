// JIRA API Integration using local proxy (CORS-free)
class JiraSprintResolverProxy {
    constructor(proxyBaseUrl = 'http://localhost:3001') {
        this.proxyBaseUrl = proxyBaseUrl;
        this.cache = new Map();
    }

    // Get real sprint data via proxy (no CORS issues)
    async getActualSprintData(issueKey) {
        if (this.cache.has(issueKey)) {
            return this.cache.get(issueKey);
        }

        try {
            console.log(`🌐 Fetching ${issueKey} via proxy...`);
            
            // Use proxy with correct field mappings
            const fieldsParam = JIRA_API_CONFIG.getFieldsParam();
            const proxyUrl = `${this.proxyBaseUrl}/api/jira/rest/api/2/issue/${issueKey}${fieldsParam}`;
            
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Proxy HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Debug: Log what fields we actually received
            console.log(`🔍 ${issueKey} JIRA fields received:`, {
                sprint: !!data.fields[JIRA_FIELD_MAPPINGS.SPRINT],
                leadingTeam: !!data.fields[JIRA_FIELD_MAPPINGS.LEADING_TEAM],
                system: !!data.fields[JIRA_FIELD_MAPPINGS.SYSTEM],
                regression: !!data.fields[JIRA_FIELD_MAPPINGS.REGRESSION],
                severity: !!data.fields[JIRA_FIELD_MAPPINGS.SEVERITY],
                assignee: !!data.fields[JIRA_FIELD_MAPPINGS.ASSIGNEE],
                status: !!data.fields[JIRA_FIELD_MAPPINGS.STATUS],
                summary: !!data.fields[JIRA_FIELD_MAPPINGS.SUMMARY],
                hasChangelog: !!data.changelog
            });
            
            const sprintData = this.extractSprintHistory(data);
            console.log(`📊 ${issueKey} extracted data:`, sprintData);
            
            this.cache.set(issueKey, sprintData);
            return sprintData;

        } catch (error) {
            console.error(`❌ Failed to get sprint data for ${issueKey}:`, error);
            return {
                currentSprint: null,
                firstSprint: null,
                allSprints: [],
                leadingTeam: null,
                system: null,
                error: error.message
            };
        }
    }

    // Same extract logic as before
    extractSprintHistory(issueData) {
        const result = {
            currentSprint: null,
            firstSprint: null,
            allSprints: [],
            leadingTeam: null,
            system: null,
            regression: null,
            severity: null,
            assignee: null,
            status: null,
            summary: null,
            error: null
        };

        try {
            // Get current sprint using correct field mapping
            const sprintField = issueData.fields[JIRA_FIELD_MAPPINGS.SPRINT];
            result.currentSprint = FIELD_EXTRACTORS.getSprintName(sprintField);
            
            // Get leading team using correct field mapping
            const leadingTeamField = issueData.fields[JIRA_FIELD_MAPPINGS.LEADING_TEAM];
            result.leadingTeam = FIELD_EXTRACTORS.getCustomFieldValue(leadingTeamField);
            
            // Get system using correct field mapping
            const systemField = issueData.fields[JIRA_FIELD_MAPPINGS.SYSTEM];
            result.system = FIELD_EXTRACTORS.getCustomFieldValue(systemField);
            
            // Get regression flag using correct field mapping
            const regressionField = issueData.fields[JIRA_FIELD_MAPPINGS.REGRESSION];
            result.regression = FIELD_EXTRACTORS.getCustomFieldValue(regressionField);
            
            // Get current assignee using correct field mapping
            const assigneeField = issueData.fields[JIRA_FIELD_MAPPINGS.ASSIGNEE];
            result.assignee = FIELD_EXTRACTORS.getUserDisplayName(assigneeField);
            
            // Get severity using correct field mapping
            const severityField = issueData.fields[JIRA_FIELD_MAPPINGS.SEVERITY];
            result.severity = FIELD_EXTRACTORS.getCustomFieldValue(severityField);
            
            // Get status using correct field mapping
            const statusField = issueData.fields[JIRA_FIELD_MAPPINGS.STATUS];
            result.status = FIELD_EXTRACTORS.getStatusName(statusField);
            
            // Get summary using correct field mapping
            const summaryField = issueData.fields[JIRA_FIELD_MAPPINGS.SUMMARY];
            result.summary = summaryField;

            // Extract sprint history from changelog
            const changelog = issueData.changelog;
            const sprintChanges = [];

            if (changelog && changelog.histories) {
                changelog.histories.forEach(history => {
                    history.items.forEach(item => {
                        if (item.field === 'Sprint') {
                            sprintChanges.push({
                                date: history.created,
                                from: item.fromString,
                                to: item.toString
                            });
                        }
                    });
                });
            }

            // Sort by date to get first sprint
            sprintChanges.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            if (sprintChanges.length > 0) {
                const firstChange = sprintChanges.find(change => change.to && change.to !== 'null');
                if (firstChange) {
                    result.firstSprint = firstChange.to;
                }
                
                result.allSprints = [...new Set(
                    sprintChanges
                        .map(change => change.to)
                        .filter(sprint => sprint && sprint !== 'null')
                )];
            }

            // Note: Team, System, and Regression are now extracted above using correct custom field mappings

            return result;

        } catch (error) {
            console.error(`❌ Error extracting sprint history:`, error);
            result.error = error.message;
            return result;
        }
    }

    getDisplaySprint(sprintData) {
        if (sprintData.firstSprint) {
            return sprintData.firstSprint;
        } else if (sprintData.currentSprint) {
            return sprintData.currentSprint;
        } else if (sprintData.error) {
            return `Error: ${sprintData.error}`;
        } else {
            return 'No Sprint Data';
        }
    }

    async processBugsWithRealData(bugs) {
        console.log('🔍 PROCESSING ALL PRODUCTION BUGS WITH PROXY-BASED JIRA API');

        console.log(`🎯 Processing ${bugs.length} Production bugs with real-time data`);

        const results = { processed: 0, errors: 0, resolved: 0 };
        const bugsToProcess = bugs; // Process all Production bugs
        
        // Adaptive batch size: smaller for priority batches, larger for background
        const isSmallBatch = bugsToProcess.length <= 50;
        const batchSize = isSmallBatch ? 5 : 10; // Faster processing for priority batches
        
        for (let i = 0; i < bugsToProcess.length; i += batchSize) {
            const batch = bugsToProcess.slice(i, i + batchSize);
            const batchNum = Math.floor(i/batchSize) + 1;
            const totalBatches = Math.ceil(bugsToProcess.length/batchSize);
            const progress = Math.round((i / bugsToProcess.length) * 100);
            
            const batchType = isSmallBatch ? 'PRIORITY' : 'BACKGROUND';
            console.log(`📦 ${batchType} batch ${batchNum}/${totalBatches} (${batch.length} bugs) - ${progress}% complete...`);

            const batchPromises = batch.map(async (bug, index) => {

                try {
                    // Adaptive delay: faster for priority batches, normal for background
                    const delay = isSmallBatch ? index * 50 : index * 100; // 50ms for priority, 100ms for background
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    // Call JIRA API for real-time data
                    console.log(`🔬 Calling JIRA API for ${bug.key}...`);

                    const jiraData = await this.getActualSprintData(bug.key);
                    
                    console.log(`📊 JIRA API response for ${bug.key}:`, jiraData);

                    // Update fields with real-time data
                    const oldValues = {
                        sprint: bug.sprint,
                        leadingTeam: bug.leadingTeam,
                        system: bug.system,
                        regression: bug.regression,
                        severity: bug.severity,
                        assignee: bug.assignee,
                        status: bug.status,
                        summary: bug.summary
                    };
                    
                    // Update sprint
                    if (jiraData.currentSprint) {
                        bug.sprint = jiraData.currentSprint;
                    }
                    
                    // Update leading team
                    if (jiraData.leadingTeam) {
                        bug.leadingTeam = jiraData.leadingTeam;
                    }
                    
                    // Update system
                    if (jiraData.system) {
                        bug.system = jiraData.system;
                    }
                    
                    // Update regression
                    if (jiraData.regression) {
                        bug.regression = jiraData.regression;
                    }
                    
                    // Update assignee
                    if (jiraData.assignee) {
                        bug.assignee = jiraData.assignee;
                    }
                    
                    // Update severity
                    if (jiraData.severity) {
                        bug.severity = jiraData.severity;
                    }
                    
                    // Update status
                    if (jiraData.status) {
                        bug.status = jiraData.status;
                    }
                    
                    // Update summary
                    if (jiraData.summary) {
                        bug.summary = jiraData.summary;
                    }
                    
                    console.log(`🔄 ${bug.key} BEFORE -> AFTER:`, {
                        sprint: `${oldValues.sprint} -> ${bug.sprint}`,
                        leadingTeam: `${oldValues.leadingTeam} -> ${bug.leadingTeam}`,
                        system: `${oldValues.system} -> ${bug.system}`,
                        regression: `${oldValues.regression} -> ${bug.regression}`,
                        severity: `${oldValues.severity} -> ${bug.severity}`,
                        assignee: `${oldValues.assignee} -> ${bug.assignee}`,
                        status: `${oldValues.status} -> ${bug.status}`,
                        summary: `${oldValues.summary} -> ${bug.summary}`
                    });
                    
                    results.resolved++;
                    
                    results.processed++;
                } catch (error) {
                    console.error(`❌ ${bug.key}: ${error.message}`);
                    results.errors++;
                }
            });

            await Promise.all(batchPromises);
        }

        console.log(`🎯 PRODUCTION BUGS PROCESSING COMPLETE: ${results.processed} processed, ${results.resolved} resolved, ${results.errors} errors`);

        // Log summary stats
        const processedPercentage = Math.round((results.processed / bugsToProcess.length) * 100);
        console.log('📊 Processing Summary:', {
            totalBugs: bugsToProcess.length,
            processed: results.processed,
            processedPercentage: `${processedPercentage}%`,
            resolved: results.resolved,
            errors: results.errors
        });
        
        return results;
    }
}

// Proxy-based initialization
function initializeJiraIntegrationProxy() {
    const resolver = new JiraSprintResolverProxy();
    
    return {
        resolver,
        async enhanceBugsWithRealData(bugs, testLimit = null) {
            try {
                // Test proxy connectivity first using the first bug in the dataset
                console.log('🧪 Testing proxy connectivity...');
                const testBugKey = bugs.length > 0 ? bugs[0].key : 'BT-737';
                await fetch(`http://localhost:3001/api/jira/rest/api/2/issue/${testBugKey}`);
                console.log('✅ Proxy connection successful!');
                
                let bugsToProcess = bugs;
                if (testLimit && testLimit > 0) {
                    bugsToProcess = bugs.slice(0, testLimit);
                    console.log(`🧪 TEST MODE: Processing ${testLimit} bugs via proxy`);
                }

                await resolver.processBugsWithRealData(bugsToProcess);
                return bugs;
            } catch (error) {
                console.error('❌ Proxy integration failed:', error);
                console.log('💡 Make sure the proxy server is running: node jira-proxy.js');
                return bugs;
            }
        }
    };
}