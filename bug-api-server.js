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
            console.log(`   POST /api/sync - Incremental sync from Jira`);
            console.log(`   GET  /api/bugs/:id/details - Get bug details`);
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
            } else if (method === 'POST' && pathname === '/api/sync') {
                await this.handleSync(req, res);
            } else if (method === 'GET' && pathname.startsWith('/api/bugs/') && pathname.endsWith('/details')) {
                const bugId = pathname.split('/')[3];
                await this.handleGetBugDetails(req, res, bugId);
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
                description: issue.fields.description ? this.extractTextFromADF(issue.fields.description) : ''
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
            daysOpen: bug.daysOpen,
            
            // Custom fields
            leadingTeam: bug.leadingTeam,
            system: bug.system,
            sprintName: bug.sprintName,
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