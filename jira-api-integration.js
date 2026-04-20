// ROBUST JIRA API INTEGRATION - NO FAKE DATA
// This replaces the broken fallback logic with real Jira queries

class JiraSprintResolver {
    constructor(jiraConfig) {
        this.jiraBaseUrl = jiraConfig.baseUrl; // e.g., 'https://hibob.atlassian.net'
        this.authToken = jiraConfig.token;
        this.email = jiraConfig.email;
        this.cache = new Map(); // Cache to avoid duplicate API calls
    }

    // Get real sprint data from Jira API
    async getActualSprintData(issueKey) {
        if (this.cache.has(issueKey)) {
            return this.cache.get(issueKey);
        }

        try {
            console.log(`🌐 Fetching data for ${issueKey}...`);
            
            // Query Jira API for real sprint, team, and system data
            const response = await fetch(`${this.jiraBaseUrl}/rest/api/2/issue/${issueKey}?expand=changelog&fields=customfield_10020,components,labels,customfield_team,assignee,status`, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${btoa(`${this.email}:${this.authToken}`)}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                mode: 'cors' // Explicit CORS mode
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const sprintData = this.extractSprintHistory(data);
            
            this.cache.set(issueKey, sprintData);
            return sprintData;

        } catch (error) {
            console.error(`Failed to get sprint data for ${issueKey}:`, error);
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

    // Extract sprint information from Jira response
    extractSprintHistory(issueData) {
        const result = {
            currentSprint: null,
            firstSprint: null,
            allSprints: [],
            leadingTeam: null,
            system: null,
            error: null
        };

        try {
            // Get current sprint from custom field (usually customfield_10020 for sprint)
            const currentSprintField = issueData.fields.customfield_10020;
            if (currentSprintField && currentSprintField.length > 0) {
                const currentSprint = currentSprintField[currentSprintField.length - 1];
                result.currentSprint = currentSprint.name;
            }

            // Extract sprint history from changelog
            const changelog = issueData.changelog;
            const sprintChanges = [];

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

            // Sort by date to get first sprint
            sprintChanges.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            if (sprintChanges.length > 0) {
                // First sprint is the first "to" value that's not null
                const firstChange = sprintChanges.find(change => change.to && change.to !== 'null');
                if (firstChange) {
                    result.firstSprint = firstChange.to;
                }
                
                // All sprints
                result.allSprints = [...new Set(
                    sprintChanges
                        .map(change => change.to)
                        .filter(sprint => sprint && sprint !== 'null')
                )];
            }

            // Extract leading team (may be in components, labels, or custom fields)
            if (issueData.fields.components && issueData.fields.components.length > 0) {
                result.leadingTeam = issueData.fields.components[0].name;
            } else if (issueData.fields.labels && issueData.fields.labels.length > 0) {
                // Look for team-related labels
                const teamLabel = issueData.fields.labels.find(label => 
                    label.includes('Team:') || label.includes('MIS-') || label.includes('AI-')
                );
                if (teamLabel) {
                    result.leadingTeam = teamLabel.replace('Team:', '').trim();
                }
            }

            // Extract system (may be in components, labels, or description)
            if (issueData.fields.components && issueData.fields.components.length > 1) {
                result.system = issueData.fields.components[1].name;
            } else if (issueData.fields.labels) {
                // Look for system-related labels
                const systemLabel = issueData.fields.labels.find(label => 
                    label.includes('System:') || label.includes('SFDC') || label.includes('Netsuite')
                );
                if (systemLabel) {
                    result.system = systemLabel.replace('System:', '').trim();
                }
            }

            return result;

        } catch (error) {
            console.error(`Error extracting sprint history for issue:`, error);
            result.error = error.message;
            return result;
        }
    }

    // Resolve sprint display value for dashboard
    getDisplaySprint(sprintData) {
        // Priority: First sprint > Current sprint > None
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

    // Process all bugs in dashboard
    async processBugsWithRealData(bugs) {
        console.log('🔍 PROCESSING BUGS WITH REAL JIRA API DATA');
        console.log('⚠️  This will make API calls - ensure rate limits are respected');

        const results = {
            processed: 0,
            errors: 0,
            resolved: 0,
            rateLimited: false
        };

        // Process in batches to respect rate limits
        const batchSize = 10;
        for (let i = 0; i < bugs.length; i += batchSize) {
            const batch = bugs.slice(i, i + batchSize);
            
            console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(bugs.length/batchSize)}...`);

            // Process batch with delay
            const batchPromises = batch.map(async (bug, index) => {
                // Add delay to respect rate limits
                await new Promise(resolve => setTimeout(resolve, index * 100));
                
                try {
                    // Query API if any critical field is missing
                    const needsApiCall = !bug.sprint || bug.sprint === 'None' || bug.sprint === 'N/A' || bug.sprint === 'No Data' ||
                                       !bug.leadingTeam || bug.leadingTeam === 'No Data' ||
                                       !bug.system || bug.system === 'No Data';
                    
                    if (needsApiCall) {
                        const jiraData = await this.getActualSprintData(bug.key);
                        
                        // Update sprint if missing
                        if (!bug.sprint || bug.sprint === 'None' || bug.sprint === 'N/A' || bug.sprint === 'No Data') {
                            const displaySprint = this.getDisplaySprint(jiraData);
                            bug.sprint = displaySprint;
                        }
                        
                        // Update leading team if missing
                        if ((!bug.leadingTeam || bug.leadingTeam === 'No Data') && jiraData.leadingTeam) {
                            bug.leadingTeam = jiraData.leadingTeam;
                        }
                        
                        // Update system if missing
                        if ((!bug.system || bug.system === 'No Data') && jiraData.system) {
                            bug.system = jiraData.system;
                        }
                        
                        console.log(`✅ ${bug.key}: Updated from Jira API - Sprint: ${bug.sprint}, Team: ${bug.leadingTeam}, System: ${bug.system}`);
                        bug.dataSource = 'Enhanced with Jira API';
                        results.resolved++;
                    } else {
                        bug.dataSource = 'Export data';
                    }
                    
                    results.processed++;
                } catch (error) {
                    console.error(`❌ ${bug.key}: ${error.message}`);
                    bug.sprint = bug.sprint || 'API Error';
                    bug.sprintSource = 'Error';
                    results.errors++;
                }
            });

            await Promise.all(batchPromises);

            // Longer delay between batches
            if (i + batchSize < bugs.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`🎯 JIRA API PROCESSING COMPLETE:
        - Total bugs: ${bugs.length}
        - Processed: ${results.processed}
        - Resolved via API: ${results.resolved}  
        - Errors: ${results.errors}
        - Success rate: ${Math.round((results.resolved / results.processed) * 100)}%`);

        return results;
    }
}

// Usage example for dashboard integration
function initializeJiraIntegration() {
    // Configuration - get from global variables (set in dashboard)
    const jiraConfig = {
        baseUrl: 'https://hibob.atlassian.net',
        email: window.JIRA_EMAIL || 'guy.levin@hibob.io', // Fallback to known email
        token: window.JIRA_API_TOKEN || 'ATATT3xFfGF0B9XbLpONas1I4ajySGn_mOUcj6U-7ckO2iSLB-xW2ma7Mb4WjaB_tHU7Qy7sXLHo_9-3pS5eaa6iLhkbscZJUiK_vZcxOTZ5KvHwg2ZWpFgnSTEK7N-0f5dw6a-EFShJKpMYUGmXcyxZERKXsdojohHsxXsDcWCiNqu-iVlJ5n8=FC8BCCBF' // From .env file
    };

    const resolver = new JiraSprintResolver(jiraConfig);
    
    return {
        resolver,
        
        // Function to integrate with existing dashboard
        async enhanceBugsWithRealData(bugs, testLimit = null) {
            if (!jiraConfig.email || !jiraConfig.token) {
                console.warn('🚨 Jira credentials not configured - showing export data only');
                return bugs;
            }

            try {
                // If test limit is specified, only process that many bugs
                let bugsToProcess = bugs;
                if (testLimit && testLimit > 0) {
                    bugsToProcess = bugs.slice(0, testLimit);
                    console.log(`🧪 TEST MODE: Processing only ${testLimit} bugs out of ${bugs.length} total`);
                }

                await resolver.processBugsWithRealData(bugsToProcess);
                return bugs; // Return all bugs, but only first X were processed
            } catch (error) {
                console.error('Failed to enhance bugs with Jira API:', error);
                return bugs;
            }
        }
    };
}

// Export for use in dashboard
if (typeof module !== 'undefined') {
    module.exports = { JiraSprintResolver, initializeJiraIntegration };
}