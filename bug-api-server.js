// Simple Bug API Server - Handles lightweight data and incremental sync
const http = require('http');
const fs = require('fs');
const path = require('path');
const { JiraClient } = require('./jira-bugs.js');
const { JIRA_FIELD_MAPPINGS, FIELD_EXTRACTORS } = require('./jira-field-mappings.js');

class BugApiServer {
    constructor(port = 3002) {
        this.port = port;
        this.dataFile = path.join(__dirname, 'bugs-cache.json');
        this.jiraClient = null;
        this.initializeJiraClient();
    }

    // Initialize Jira client from environment
    initializeJiraClient() {
        try {
            const env = this.loadEnv();
            const JIRA_DOMAIN = env.JIRA_DOMAIN || 'hibob.atlassian.net';
            const EMAIL = env.JIRA_EMAIL || 'guy.levin@hibob.io';
            const API_TOKEN = env.JIRA_API_TOKEN;
            
            if (!API_TOKEN || API_TOKEN === 'your-api-token-here') {
                console.warn('⚠️ No Jira API token configured - sync will not work');
                return;
            }
            
            this.jiraClient = new JiraClient(JIRA_DOMAIN, EMAIL, API_TOKEN);
            console.log('✅ Jira client initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Jira client:', error);
        }
    }

    // Simple .env file parser
    loadEnv() {
        try {
            const envPath = path.join(__dirname, '.env');
            const envContent = fs.readFileSync(envPath, 'utf8');
            const env = {};
            
            envContent.split('\n').forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('#')) {
                    const [key, ...valueParts] = trimmedLine.split('=');
                    if (key && valueParts.length > 0) {
                        env[key.trim()] = valueParts.join('=').trim();
                    }
                }
            });
            
            return env;
        } catch (error) {
            return {};
        }
    }

    // Start the server
    start() {
        const server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });
        
        server.listen(this.port, () => {
            console.log(`🚀 Bug API Server running on http://localhost:${this.port}`);
            console.log(`📖 Available endpoints:`);
            console.log(`   GET  /api/bugs-lite - Get lightweight bugs data`);
            console.log(`   GET  /api/issues-lite?types=Bug,Story,Test - Get lightweight issues data (NEW)`);
            console.log(`   POST /api/sync - Incremental sync from Jira`);
            console.log(`   POST /api/sync-issues - Multi-issue type sync from Jira (NEW)`);
            console.log(`   GET  /api/bugs/:id/details - Get bug details`);
            console.log(`   GET  /api/issues/:id/details - Get issue details (NEW)`);
            console.log(`   GET  /health - Health check`);
        });
        
        return server;
    }

    // Handle HTTP requests
    async handleRequest(req, res) {
        const url = new URL(req.url, `http://localhost:${this.port}`);
        const method = req.method;
        const pathname = url.pathname;

        // Add CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        try {
            console.log(`${method} ${pathname}`);

            if (method === 'GET' && pathname === '/api/bugs-lite') {
                await this.handleGetBugsLite(req, res);
            } else if (method === 'GET' && pathname === '/api/issues-lite') {
                await this.handleGetIssuesLite(req, res);
            } else if (method === 'POST' && pathname === '/api/sync') {
                await this.handleSync(req, res);
            } else if (method === 'POST' && pathname === '/api/sync-issues') {
                await this.handleSyncIssues(req, res);
            } else if (method === 'GET' && pathname.startsWith('/api/bugs/') && pathname.endsWith('/details')) {
                const bugId = pathname.split('/')[3];
                await this.handleGetBugDetails(req, res, bugId);
            } else if (method === 'GET' && pathname.startsWith('/api/issues/') && pathname.endsWith('/details')) {
                const issueId = pathname.split('/')[3];
                await this.handleGetIssueDetails(req, res, issueId);
            } else if (method === 'GET' && pathname === '/health') {
                this.handleHealth(req, res);
            } else {
                this.sendError(res, 404, 'Not Found');
            }
        } catch (error) {
            console.error('❌ Request error:', error);
            this.sendError(res, 500, 'Internal Server Error', error.message);
        }
    }

    // GET /api/bugs-lite - Return lightweight bugs data
    async handleGetBugsLite(req, res) {
        try {
            const data = this.loadCachedData();
            
            if (!data || !data.bugs || data.bugs.length === 0) {
                // No cached data, need initial sync
                this.sendJson(res, {
                    bugs: [],
                    metadata: {
                        totalBugs: 0,
                        lastSync: null,
                        needsInitialSync: true
                    }
                });
                return;
            }

            // Return lightweight data
            const lightweightBugs = data.bugs.map(bug => this.toLightweightBug(bug));
            
            this.sendJson(res, {
                bugs: lightweightBugs,
                metadata: {
                    totalBugs: lightweightBugs.length,
                    lastSync: data.lastSync,
                    jiraInstance: data.metadata?.jiraInstance || 'hibob.atlassian.net'
                }
            });
            
        } catch (error) {
            console.error('❌ Error getting bugs-lite:', error);
            this.sendError(res, 500, 'Failed to get bugs', error.message);
        }
    }

    // POST /api/sync - Incremental sync from Jira
    async handleSync(req, res) {
        if (!this.jiraClient) {
            this.sendError(res, 503, 'Jira client not configured');
            return;
        }

        try {
            const body = await this.readRequestBody(req);
            const { since } = JSON.parse(body || '{}');
            
            console.log('🔄 Starting sync...', since ? `since ${since}` : 'full sync');
            
            let allBugs;
            if (since) {
                // Incremental sync - fetch bugs updated since timestamp
                allBugs = await this.fetchUpdatedBugs(since);
            } else {
                // Full sync - fetch all production bugs
                allBugs = await this.fetchAllProductionBugs();
            }
            
            // Process and cache the data
            const processedBugs = this.processBugsData(allBugs);
            
            // Save to cache file
            const cacheData = {
                bugs: processedBugs,
                metadata: {
                    totalBugs: processedBugs.length,
                    jiraInstance: 'hibob.atlassian.net',
                    syncType: since ? 'incremental' : 'full'
                },
                lastSync: new Date().toISOString()
            };
            
            if (since) {
                // Merge with existing data for incremental sync
                this.mergeIncrementalData(cacheData, processedBugs);
            } else {
                // Replace all data for full sync
                this.saveCachedData(cacheData);
            }
            
            console.log(`✅ Sync complete: ${processedBugs.length} bugs processed`);
            
            this.sendJson(res, {
                success: true,
                syncType: since ? 'incremental' : 'full',
                bugsProcessed: processedBugs.length,
                lastSync: cacheData.lastSync
            });
            
        } catch (error) {
            console.error('❌ Sync failed:', error);
            this.sendError(res, 500, 'Sync failed', error.message);
        }
    }

    // NEW: GET /api/issues-lite - Return lightweight issues data (bugs, stories, test cases)
    async handleGetIssuesLite(req, res) {
        try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const typesParam = url.searchParams.get('types') || 'Bug';
            const issueTypes = typesParam.split(',').map(t => t.trim());
            
            console.log(`📊 Fetching issues for types: ${issueTypes.join(', ')}`);
            
            let allIssues = [];
            let actualIssueTypes = [];
            let lastSync = null;
            let jiraInstance = 'hibob.atlassian.net';
            
            // Handle Bug requests - use dedicated bugs cache
            if (issueTypes.includes('Bug')) {
                const bugsData = this.loadCachedData();
                if (bugsData && bugsData.bugs) {
                    const bugsWithType = bugsData.bugs.map(bug => ({...bug, issueType: 'Bug'}));
                    allIssues.push(...bugsWithType);
                    actualIssueTypes.push('Bug');
                    lastSync = bugsData.lastSync;
                    jiraInstance = bugsData.metadata?.jiraInstance || jiraInstance;
                    console.log(`✅ Added ${bugsData.bugs.length} bugs`);
                }
            }
            
            // Handle Stories and Test Cases from multi-issue cache
            if (issueTypes.includes('Story') || issueTypes.includes('Test')) {
                const issuesData = this.loadCachedIssuesData();
                if (issuesData && issuesData.issues) {
                    const filteredIssues = issuesData.issues.filter(issue => {
                        if (issueTypes.includes('Story') && issue.issueType === 'Story') {
                            return true;
                        }
                        if (issueTypes.includes('Test') && (issue.issueType === 'Test' || issue.issueType === 'Test Case')) {
                            return true;
                        }
                        return false;
                    });
                    
                    allIssues.push(...filteredIssues);
                    
                    // Track unique issue types
                    filteredIssues.forEach(issue => {
                        if (!actualIssueTypes.includes(issue.issueType)) {
                            actualIssueTypes.push(issue.issueType);
                        }
                    });
                    
                    lastSync = issuesData.lastSync || lastSync;
                    jiraInstance = issuesData.metadata?.jiraInstance || jiraInstance;
                    console.log(`✅ Added ${filteredIssues.length} stories/test cases`);
                }
            }
            
            // Convert to lightweight format
            const lightweightIssues = allIssues.map(issue => this.toLightweightIssue(issue));
            
            console.log(`📊 Total issues returned: ${lightweightIssues.length} of types: ${actualIssueTypes.join(', ')}`);
            
            this.sendJson(res, {
                issues: lightweightIssues,
                metadata: {
                    totalIssues: lightweightIssues.length,
                    issueTypes: actualIssueTypes,
                    lastSync: lastSync,
                    jiraInstance: jiraInstance
                }
            });
            
        } catch (error) {
            console.error('❌ Error getting issues-lite:', error);
            this.sendError(res, 500, 'Failed to get issues', error.message);
        }
    }

    // NEW: POST /api/sync-issues - Sync multiple issue types from JIRA
    async handleSyncIssues(req, res) {
        if (!this.jiraClient) {
            this.sendError(res, 503, 'Jira client not configured');
            return;
        }

        try {
            const fs = require('fs');
            const debugLog = (message) => {
                try {
                    fs.appendFileSync('sprint-debug.log', `${new Date().toISOString()} - SYNC: ${message}\n`);
                } catch (e) { /* ignore */ }
            };
            
            debugLog('handleSyncIssues called');
            
            const body = await this.readRequestBody(req);
            const { since, types } = JSON.parse(body || '{}');
            const issueTypes = types || ['Bug', 'Story', 'Test'];
            
            console.log('🔄 Starting multi-issue sync...', since ? `since ${since}` : 'full sync');
            console.log('📋 Issue types:', issueTypes.join(', '));
            debugLog(`Starting sync for types: ${issueTypes.join(', ')}`);
            
            let allIssues;
            if (since) {
                // Incremental sync - fetch issues updated since timestamp
                debugLog('Using incremental sync');
                allIssues = await this.fetchUpdatedIssues(since, issueTypes);
            } else {
                // Full sync - fetch all issues of specified types
                debugLog('Using full sync - calling fetchAllIssues');
                allIssues = await this.fetchAllIssues(issueTypes);
            }
            
            debugLog(`Fetched ${allIssues?.issues?.length || 0} issues from JIRA`);
            debugLog('About to call processIssuesData');

            const processedIssues = this.processIssuesData(allIssues);
            
            debugLog(`processIssuesData returned ${processedIssues?.length || 0} processed issues`);
            
            // Store in cache (for now, separate from bugs cache)
            const issueData = {
                issues: processedIssues,
                metadata: {
                    totalIssues: processedIssues.length,
                    issueTypes: issueTypes,
                    jiraInstance: this.jiraClient.domain || 'hibob.atlassian.net'
                },
                lastSync: new Date().toISOString()
            };

            this.saveCachedIssuesData(issueData);
            
            this.sendJson(res, {
                success: true,
                syncType: since ? 'incremental' : 'full',
                issuesProcessed: processedIssues.length,
                lastSync: issueData.lastSync
            });
            
        } catch (error) {
            console.error('❌ Multi-issue sync failed:', error);
            this.sendError(res, 500, 'Multi-issue sync failed', error.message);
        }
    }

    // NEW: GET /api/issues/:id/details - Get heavy issue details
    async handleGetIssueDetails(req, res, issueId) {
        try {
            // First try issues cache, then fall back to bugs cache
            let issue = null;
            
            const issuesData = this.loadCachedIssuesData();
            if (issuesData?.issues) {
                issue = issuesData.issues.find(i => i.key === issueId);
            }
            
            if (!issue) {
                const bugsData = this.loadCachedData();
                issue = bugsData?.bugs?.find(b => b.key === issueId);
            }
            
            if (!issue) {
                this.sendError(res, 404, 'Issue not found');
                return;
            }

            // Return full issue details
            this.sendJson(res, {
                issue: issue,
                metadata: {
                    issueType: issue.issueType || 'Bug',
                    lastUpdate: issue.updated
                }
            });
            
        } catch (error) {
            console.error('❌ Error getting issue details:', error);
            this.sendError(res, 500, 'Failed to get issue details', error.message);
        }
    }

    // GET /api/bugs/:id/details - Get heavy bug details
    async handleGetBugDetails(req, res, bugId) {
        try {
            const data = this.loadCachedData();
            const bug = data?.bugs?.find(b => b.key === bugId);
            
            if (!bug) {
                this.sendError(res, 404, 'Bug not found');
                return;
            }
            
            // Return heavy fields (description, etc.)
            this.sendJson(res, {
                key: bug.key,
                description: bug.description || '',
                // Add other heavy fields here when available
                // comments: bug.comments || [],
                // changelog: bug.changelog || [],
                // linkedIssues: bug.linkedIssues || []
            });
            
        } catch (error) {
            console.error(`❌ Error getting bug details for ${bugId}:`, error);
            this.sendError(res, 500, 'Failed to get bug details', error.message);
        }
    }

    // Health check endpoint
    handleHealth(req, res) {
        const data = this.loadCachedData();
        this.sendJson(res, {
            status: 'healthy',
            jiraClientConfigured: !!this.jiraClient,
            cachedBugs: data?.bugs?.length || 0,
            lastSync: data?.lastSync || null
        });
    }

    // Fetch all production bugs from Jira
    async fetchAllProductionBugs() {
        const allBugs = [];
        let nextPageToken = null;
        const maxResults = 100;
        let pageNumber = 1;

        do {
            console.log(`📥 Fetching bugs page ${pageNumber}...`);
            const response = await this.jiraClient.getBugsWithTokenPagination(null, maxResults, nextPageToken);
            
            if (response.issues && response.issues.length > 0) {
                allBugs.push(...response.issues);
                console.log(`   ✅ Got ${response.issues.length} bugs (${allBugs.length} total so far)`);
                
                if (response.isLast) break;
                nextPageToken = response.nextPageToken;
                pageNumber++;
            } else {
                break;
            }
            
            // Safety check
            if (pageNumber > 100) {
                console.log('⚠️ Reached safety limit of 100 pages');
                break;
            }
            
        } while (nextPageToken);
        
        console.log(`📊 Retrieved ${allBugs.length} bugs total`);
        return { issues: allBugs };
    }

    // Fetch bugs updated since timestamp (for incremental sync)
    async fetchUpdatedBugs(since) {
        // Convert since timestamp to JQL format
        const sinceDate = new Date(since).toISOString().split('T')[0]; // YYYY-MM-DD format
        
        console.log(`📥 Fetching bugs updated since ${sinceDate}...`);
        
        // Use the existing JiraClient but with updated JQL
        // We'll need to modify the JQL to include the updated date filter
        const allBugs = [];
        let nextPageToken = null;
        const maxResults = 100;
        
        // For now, fetch all and filter - in production you'd modify the JQL
        const response = await this.fetchAllProductionBugs();
        
        // Filter to only bugs updated since the timestamp
        const updatedBugs = response.issues.filter(issue => {
            const updated = new Date(issue.fields.updated);
            const sinceTimestamp = new Date(since);
            return updated > sinceTimestamp;
        });
        
        console.log(`📊 Found ${updatedBugs.length} bugs updated since ${since}`);
        return { issues: updatedBugs };
    }

    // Process raw Jira bug data into our format
    processBugsData(jiraResponse) {
        return jiraResponse.issues.map((issue, index) => {
            const created = issue.fields.created;
            const updated = issue.fields.updated;
            const fields = issue.fields;

            // Extract all custom fields using the field extractors
            const leadingTeam = FIELD_EXTRACTORS.getCustomFieldValue(fields[JIRA_FIELD_MAPPINGS.LEADING_TEAM]);
            const system = FIELD_EXTRACTORS.getCustomFieldValue(fields[JIRA_FIELD_MAPPINGS.SYSTEM]);
            const regression = FIELD_EXTRACTORS.getCustomFieldValue(fields[JIRA_FIELD_MAPPINGS.REGRESSION]);
            const severity = FIELD_EXTRACTORS.getCustomFieldValue(fields[JIRA_FIELD_MAPPINGS.SEVERITY]);
            const bugType = FIELD_EXTRACTORS.getCustomFieldValue(fields[JIRA_FIELD_MAPPINGS.BUG_TYPE]);
            const sprintName = FIELD_EXTRACTORS.getSprintName(fields[JIRA_FIELD_MAPPINGS.SPRINT]);

            // Debug logging for first few bugs
            if (index < 3) {
                console.log(`🐛 Bug ${issue.key} field extraction:`, {
                    leadingTeam: { raw: fields[JIRA_FIELD_MAPPINGS.LEADING_TEAM], extracted: leadingTeam },
                    system: { raw: fields[JIRA_FIELD_MAPPINGS.SYSTEM], extracted: system },
                    regression: { raw: fields[JIRA_FIELD_MAPPINGS.REGRESSION], extracted: regression },
                    severity: { raw: fields[JIRA_FIELD_MAPPINGS.SEVERITY], extracted: severity },
                    sprintName: { raw: fields[JIRA_FIELD_MAPPINGS.SPRINT], extracted: sprintName }
                });
            }

            // Extract resolution date from resolution field or changelog
            const resolution = issue.fields.resolution;
            let resolutionDate = resolution && resolution.date ? resolution.date : null;
            
            // If no resolution date, try to find deployment date from changelog
            if (!resolutionDate && issue.changelog && issue.changelog.histories) {
                resolutionDate = this.extractDeploymentDateFromChangelog(issue.changelog.histories);
            }
            
            const resolutionDateFormatted = resolutionDate ? new Date(resolutionDate).toLocaleDateString() : null;

            return {
                key: issue.key,
                project: issue.key.split('-')[0],
                summary: issue.fields.summary,
                status: FIELD_EXTRACTORS.getStatusName(issue.fields.status),
                priority: issue.fields.priority ? issue.fields.priority.name : 'None',
                assignee: FIELD_EXTRACTORS.getUserDisplayName(issue.fields.assignee) || 'Unassigned',
                reporter: FIELD_EXTRACTORS.getUserDisplayName(issue.fields.reporter) || 'Unknown',
                created: created,
                updated: updated,
                createdDate: new Date(created).toLocaleDateString(),
                updatedDate: new Date(updated).toLocaleDateString(),
                resolutionDate: resolutionDate,
                resolutionDateFormatted: resolutionDateFormatted,
                daysOpen: this.calculateDaysOpen(created),
                
                // Custom fields
                leadingTeam: leadingTeam,
                system: system,
                sprintName: sprintName,
                regression: regression,
                severity: severity,
                bugType: bugType,
                
                // Additional data
                components: fields.components || [],
                labels: fields.labels || [],
                description: issue.fields.description ? this.extractTextFromADF(issue.fields.description) : '',
                changelog: issue.changelog || null
            };
        });
    }

    // Convert full bug to lightweight version (remove heavy fields)
    toLightweightBug(bug) {
        return {
            id: bug.key,
            key: bug.key,
            project: bug.project,
            summary: bug.summary,
            status: bug.status,
            priority: bug.priority,
            assignee: bug.assignee,
            reporter: bug.reporter,
            created: bug.created,
            updated: bug.updated,
            createdDate: bug.createdDate,
            updatedDate: bug.updatedDate,
            resolutionDate: bug.resolutionDate,
            resolutionDateFormatted: bug.resolutionDateFormatted,
            daysOpen: bug.daysOpen,
            
                // Custom fields
                leadingTeam: bug.leadingTeam,
                system: bug.system,
                sprintName: bug.sprintName,
                sprint: bug.sprintName, // Dashboard compatibility
                regression: bug.regression,
                severity: bug.severity,
                bugType: bug.bugType,
            
            // Additional data (lightweight)
            components: bug.components,
            labels: bug.labels,
            
            // Exclude: description (heavy field - load on demand)
        };
    }

    // Merge incremental sync data with existing cache
    mergeIncrementalData(cacheData, newBugs) {
        const existing = this.loadCachedData();
        if (!existing || !existing.bugs) {
            // No existing data, save as-is
            this.saveCachedData(cacheData);
            return;
        }

        // Create map for efficient merging
        const bugMap = new Map(existing.bugs.map(bug => [bug.key, bug]));
        
        // Update/add new bugs
        newBugs.forEach(bug => {
            bugMap.set(bug.key, bug);
        });
        
        // Save merged data
        const merged = {
            ...cacheData,
            bugs: Array.from(bugMap.values()),
            metadata: {
                ...cacheData.metadata,
                totalBugs: bugMap.size
            }
        };
        
        this.saveCachedData(merged);
        console.log(`🔄 Merged ${newBugs.length} updated bugs into cache`);
    }

    // Load cached data from file
    loadCachedData() {
        try {
            if (!fs.existsSync(this.dataFile)) {
                return null;
            }
            const content = fs.readFileSync(this.dataFile, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('❌ Error loading cached data:', error);
            return null;
        }
    }

    // Save data to cache file
    saveCachedData(data) {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            console.log(`💾 Saved ${data.bugs.length} bugs to cache file`);
        } catch (error) {
            console.error('❌ Error saving cached data:', error);
            throw error;
        }
    }

    // Helper methods
    calculateDaysOpen(createdDate) {
        const created = new Date(createdDate);
        const now = new Date();
        const diffTime = Math.abs(now - created);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Extract deployment date from changelog by finding status change to "Deployed"
    extractDeploymentDateFromChangelog(histories) {
        if (!histories || !Array.isArray(histories)) {
            return null;
        }

        // Look through all changelog entries, newest first
        for (let i = histories.length - 1; i >= 0; i--) {
            const history = histories[i];
            
            if (!history.items || !Array.isArray(history.items)) {
                continue;
            }

            // Check if this history entry contains a status change to "Deployed"
            for (const item of history.items) {
                if (item.field === 'status' && 
                    (item.toString === 'Deployed' || item.to === 'Deployed')) {
                    return history.created;
                }
            }
        }

        return null;
    }

    // Extract date when issue status changed to a specific status (e.g., "Done")
    extractStatusChangeDate(histories, targetStatus) {
        if (!histories || !Array.isArray(histories)) {
            return null;
        }

        // Look through all changelog entries, newest first
        for (let i = histories.length - 1; i >= 0; i--) {
            const history = histories[i];
            
            if (!history.items || !Array.isArray(history.items)) {
                continue;
            }

            // Check if this history entry contains a status change to the target status
            for (const item of history.items) {
                if (item.field === 'status' && 
                    (item.toString === targetStatus || item.to === targetStatus)) {
                    return history.created;
                }
            }
        }

        return null;
    }

    // Calculate fix duration in days between two dates
    calculateFixDuration(createdDate, resolvedDate) {
        if (!createdDate || !resolvedDate) {
            return null;
        }

        const created = new Date(createdDate);
        const resolved = new Date(resolvedDate);
        const diffTime = Math.abs(resolved - created);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    extractTextFromADF(adfDocument) {
        if (!adfDocument || !adfDocument.content) return '';
        
        let text = '';
        const extractText = (node) => {
            if (node.type === 'text') {
                text += node.text;
            } else if (node.content) {
                node.content.forEach(extractText);
            }
        };
        
        adfDocument.content.forEach(extractText);
        return text.trim();
    }

    // NEW: Multi-issue helper methods
    
    // Extract first sprint from changelog (used for stories and test cases)
    extractFirstSprintFromChangelog(issue) {
        const result = {
            currentSprint: null,
            firstSprint: null,
            error: null
        };

        try {
            // Get current sprint from custom field (customfield_10020 for sprint)
            const currentSprintField = issue.fields.customfield_10020;
            if (currentSprintField && currentSprintField.length > 0) {
                const currentSprint = currentSprintField[currentSprintField.length - 1];
                result.currentSprint = currentSprint.name;
            }

            // Extract sprint history from changelog
            const changelog = issue.changelog;
            if (changelog && changelog.histories) {
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
                }
            }
        } catch (error) {
            result.error = error.message;
        }

        return result;
    }

    // Get display sprint with priority: First sprint > Current sprint > None
    getDisplaySprintForIssue(sprintData) {
        // Priority: First sprint > Current sprint > None
        if (sprintData.firstSprint) {
            return sprintData.firstSprint;
        } else if (sprintData.currentSprint) {
            return sprintData.currentSprint;
        } else if (sprintData.error) {
            return `Error: ${sprintData.error}`;
        } else {
            return null; // Will use existing logic as fallback
        }
    }
    
    // Convert any issue type to lightweight version
    toLightweightIssue(issue) {
        const base = {
            id: issue.key,
            key: issue.key,
            project: issue.project,
            summary: issue.summary,
            status: issue.status,
            priority: issue.priority,
            assignee: issue.assignee,
            reporter: issue.reporter,
            created: issue.created,
            updated: issue.updated,
            createdDate: issue.createdDate,
            updatedDate: issue.updatedDate,
            resolutionDate: issue.resolutionDate,
            resolutionDateFormatted: issue.resolutionDateFormatted,
            daysOpen: issue.daysOpen,
            
            // Common fields
            leadingTeam: issue.leadingTeam,
            system: issue.system,
            sprintName: issue.sprintName,
            sprint: issue.sprintName, // Dashboard compatibility
            components: issue.components,
            labels: issue.labels,
            
            // Issue type
            issueType: issue.issueType || 'Bug'
        };

        // Add type-specific fields
        if (issue.issueType === 'Bug' || !issue.issueType) {
            base.regression = issue.regression;
            base.severity = issue.severity;
            base.bugType = issue.bugType;
        } else if (issue.issueType === 'Story') {
            base.storyPoints = issue.storyPoints || 0;
            base.epicLink = issue.epicLink;
            base.testCaseCreated = issue.testCaseCreated;
            base.fixDuration = issue.fixDuration || null;
        } else if (issue.issueType === 'Test Case' || issue.issueType === 'Test') {
            base.generatedFromAI = issue.generatedFromAI;
            base.aiGeneratedTestCases = issue.aiGeneratedTestCases;
            base.testType = issue.testType;
        }

        return base;
    }

    // Fetch all issues of specified types
    async fetchAllIssues(issueTypes = ['Bug']) {
        console.log(`🔄 Fetching all ${issueTypes.join(', ')} issues...`);
        
        let page = 0;
        const maxPages = 100;
        let allIssues = [];
        let nextPageToken = null;

        while (page < maxPages) {
            console.log(`📄 Fetching page ${page + 1}...`);
            const response = await this.jiraClient.getIssuesWithTokenPagination(issueTypes, null, 100, nextPageToken);
            
            allIssues.push(...response.issues);
            console.log(`   Found ${response.issues.length} issues (${allIssues.length} total so far)`);

            if (response.isLast || !response.nextPageToken) {
                break;
            }

            nextPageToken = response.nextPageToken;
            page++;
        }

        console.log(`✅ Completed fetch: ${allIssues.length} total issues`);
        
        return {
            issues: allIssues,
            total: allIssues.length,
            metadata: {
                issueTypes: issueTypes,
                pages: page + 1
            }
        };
    }

    // Fetch issues updated since timestamp (for incremental sync)
    async fetchUpdatedIssues(since, issueTypes = ['Bug']) {
        console.log(`🔄 Fetching ${issueTypes.join(', ')} issues updated since ${since}...`);
        
        // For now, fetch all and filter - in production you'd modify the JQL
        const response = await this.fetchAllIssues(issueTypes);
        
        // Filter to only issues updated since the timestamp
        const updatedIssues = response.issues.filter(issue => {
            const updated = new Date(issue.fields.updated);
            const sinceTimestamp = new Date(since);
            return updated > sinceTimestamp;
        });

        console.log(`✅ Found ${updatedIssues.length} updated issues out of ${response.issues.length} total`);
        
        return {
            issues: updatedIssues,
            total: updatedIssues.length,
            metadata: {
                ...response.metadata,
                filteredSince: since
            }
        };
    }

    // Process multiple issue types from JIRA response
    processIssuesData(jiraResponse) {
        console.log(`🔄 Processing ${jiraResponse.issues.length} issues...`);
        
        // File-based logging for debugging sync issues
        const fs = require('fs');
        const debugLog = (message) => {
            try {
                fs.appendFileSync('sprint-debug.log', `${new Date().toISOString()} - ${message}\n`);
            } catch (e) { /* ignore */ }
        };
        
        debugLog(`Starting processIssuesData with ${jiraResponse.issues.length} issues`);
        
        const result = jiraResponse.issues.map(issue => {
            // Extract common fields
            const { FIELD_EXTRACTORS } = require('./jira-field-mappings.js');
            
            const baseIssue = {
                key: issue.key,
                project: issue.key.split('-')[0],
                summary: issue.fields.summary || '',
                status: FIELD_EXTRACTORS.getStatusName(issue.fields.status),
                priority: issue.fields.priority?.name || null,
                assignee: FIELD_EXTRACTORS.getUserDisplayName(issue.fields.assignee),
                reporter: FIELD_EXTRACTORS.getUserDisplayName(issue.fields.reporter),
                created: issue.fields.created,
                updated: issue.fields.updated,
                createdDate: new Date(issue.fields.created).toLocaleDateString(),
                updatedDate: new Date(issue.fields.updated).toLocaleDateString(),
                daysOpen: this.calculateDaysOpen(issue.fields.created),
                
                // Common custom fields
                leadingTeam: FIELD_EXTRACTORS.getCustomFieldValue(issue.fields.customfield_10574),
                system: FIELD_EXTRACTORS.getCustomFieldValue(issue.fields.customfield_10107),
                components: issue.fields.components || [],
                labels: issue.fields.labels || [],
                
                // Issue type
                issueType: FIELD_EXTRACTORS.getIssueTypeName(issue.fields.issuetype),
                
                // Resolution handling
                resolutionDate: null,
                resolutionDateFormatted: null
            };

            // UNIFIED Sprint logic for ALL issue types
            // getSprintName now returns the earliest sprint by startDate (fixed above)
            const issueType = FIELD_EXTRACTORS.getIssueTypeName(issue.fields.issuetype);
            debugLog(`Processing ${issueType} ${issue.key} with unified earliest sprint logic`);
            
            const earliestSprint = FIELD_EXTRACTORS.getSprintName(issue.fields.customfield_10020);
            baseIssue.sprintName = earliestSprint;
            baseIssue.sprint = earliestSprint; // Dashboard compatibility

            // Handle resolution date from changelog if available
            if (issue.changelog?.histories) {
                let resolutionDate = null;
                
                if (baseIssue.issueType === 'Story' && baseIssue.status === 'Done') {
                    // For stories, look for when they moved to "Done" status
                    resolutionDate = this.extractStatusChangeDate(issue.changelog.histories, 'Done');
                } else if (baseIssue.issueType === 'Bug') {
                    // For bugs, look for deployment status
                    resolutionDate = this.extractDeploymentDateFromChangelog(issue.changelog.histories);
                }
                
                if (resolutionDate) {
                    baseIssue.resolutionDate = resolutionDate;
                    baseIssue.resolutionDateFormatted = new Date(resolutionDate).toLocaleDateString();
                    
                    // Calculate fix duration for Done stories
                    if (baseIssue.issueType === 'Story' && baseIssue.status === 'Done') {
                        baseIssue.fixDuration = this.calculateFixDuration(baseIssue.created, resolutionDate);
                    }
                }
            }

            // Add type-specific fields
            if (baseIssue.issueType === 'Bug') {
                baseIssue.regression = FIELD_EXTRACTORS.getCustomFieldValue(issue.fields.customfield_10106);
                baseIssue.severity = FIELD_EXTRACTORS.getCustomFieldValue(issue.fields.customfield_10104);
                baseIssue.bugType = FIELD_EXTRACTORS.getCustomFieldValue(issue.fields.customfield_10578);
            } else if (baseIssue.issueType === 'Story') {
                baseIssue.storyPoints = FIELD_EXTRACTORS.getStoryPoints(issue.fields.customfield_10016);
                baseIssue.epicLink = FIELD_EXTRACTORS.getEpicLink(issue.fields.customfield_10014);
                
                // Debug specific stories that should be "Yes" according to CSV
                const rawTestCaseField = issue.fields[JIRA_FIELD_MAPPINGS.TEST_CASE_CREATED];
                
                // Debug BT-13419 specifically
                if (baseIssue.key === 'BT-13419') {
                    console.log(`🔍 MULTI-ISSUE SYNC - BT-13419 RAW FIELD:`, JSON.stringify(rawTestCaseField, null, 2));
                }
                
                baseIssue.testCaseCreated = FIELD_EXTRACTORS.getTestCaseCreated(rawTestCaseField);
                
                // Debug BT-13419 extraction result
                if (baseIssue.key === 'BT-13419') {
                    console.log(`🔍 MULTI-ISSUE SYNC - BT-13419 EXTRACTION RESULT: "${baseIssue.testCaseCreated}"`);
                }
            } else if (baseIssue.issueType === 'Test Case' || baseIssue.issueType === 'Test') {
                const aiGeneratedValue = FIELD_EXTRACTORS.getCustomFieldValue(issue.fields.customfield_11392);
                // Convert URL field to Yes/No/No Data format for dashboard filter
                baseIssue.generatedFromAI = aiGeneratedValue && aiGeneratedValue.trim() !== '' ? 'Yes' : 'No';
                baseIssue.aiGeneratedTestCases = aiGeneratedValue; // Keep original URL for reference
                baseIssue.testType = FIELD_EXTRACTORS.getCustomFieldValue(issue.fields[JIRA_FIELD_MAPPINGS.TEST_TYPE]);
            }

            // Add description if available
            if (issue.fields.description) {
                baseIssue.description = this.convertAdfToPlainText(issue.fields.description);
            } else {
                baseIssue.description = '';
            }

            return baseIssue;
        });
        
        debugLog(`Completed processIssuesData - processed ${result.length} issues`);
        
        // Count how many stories/test cases were processed
        const storiesAndTests = result.filter(issue => 
            issue.issueType === 'Story' || issue.issueType === 'Test Case' || issue.issueType === 'Test'
        ).length;
        
        debugLog(`Summary: ${result.length} total issues, ${storiesAndTests} stories/test cases processed with first sprint logic`);
        
        return result;
    }

    // Cache management for issues
    loadCachedIssuesData() {
        try {
            const issuesFile = path.join(__dirname, 'issues-cache.json');
            if (!fs.existsSync(issuesFile)) {
                return null;
            }
            const content = fs.readFileSync(issuesFile, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('❌ Error loading cached issues data:', error);
            return null;
        }
    }

    saveCachedIssuesData(data) {
        try {
            const issuesFile = path.join(__dirname, 'issues-cache.json');
            fs.writeFileSync(issuesFile, JSON.stringify(data, null, 2));
            console.log(`💾 Saved ${data.issues.length} issues to cache file`);
        } catch (error) {
            console.error('❌ Error saving cached issues data:', error);
            throw error;
        }
    }

    // HTTP utility methods
    async readRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
    }

    sendJson(res, data) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify(data));
    }

    sendError(res, status, message, details = null) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(status);
        res.end(JSON.stringify({
            error: message,
            details: details,
            status: status
        }));
    }
}

// Start server if run directly
if (require.main === module) {
    const server = new BugApiServer(3002);
    server.start();
}

module.exports = { BugApiServer };