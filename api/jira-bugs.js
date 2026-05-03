const https = require('https');
const fs = require('fs');
const path = require('path');

// Simple .env file parser
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
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
    console.error('Error reading .env file:', error.message);
    console.error('Please make sure .env file exists and contains your Jira credentials');
    return {};
  }
}

class JiraClient {
  constructor(domain, email, apiToken) {
    this.domain = domain;
    this.auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  }

  async makeRequest(endpoint) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.domain,
        path: endpoint,
        method: 'GET',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(jsonData);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${jsonData.errorMessages ? jsonData.errorMessages.join(', ') : 'Unknown error'}`));
            }
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err.message}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  async makePostRequest(endpoint, payload) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);
      
      const options = {
        hostname: this.domain,
        path: endpoint,
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(jsonData);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${jsonData.errorMessages ? jsonData.errorMessages.join(', ') : 'Unknown error'}`));
            }
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err.message}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(postData);
      req.end();
    });
  }

  // NEW: Get multiple issue types (bugs, stories, test cases)
  async getIssues(issueTypes = ['Bug'], projectKey = null, maxResults = 100) {
    let jql = this.buildJqlForIssueTypes(issueTypes, projectKey);
    jql += ' ORDER BY created DESC';
    
    const endpoint = `/rest/api/3/search/jql`;
    const { JIRA_FIELD_MAPPINGS, JIRA_API_CONFIG } = require('./jira-field-mappings.js');
    const payload = {
      jql: jql,
      maxResults: maxResults,
      expand: JIRA_API_CONFIG.EXPAND_OPTIONS,
      fields: JIRA_API_CONFIG.getFieldsForIssueTypes(issueTypes).split(',')
    };
    
    try {
      const response = await this.makePostRequest(endpoint, payload);
      return response;
    } catch (error) {
      console.error('Error fetching issues:', error);
      throw error;
    }
  }
  
  // NEW: Get multiple issue types with pagination
  async getIssuesWithTokenPagination(issueTypes = ['Bug'], projectKey = null, maxResults = 100, nextPageToken = null, opts = null) {
    const sinceIso = opts && opts.sinceIso ? opts.sinceIso : null;
    let jql = this.buildJqlForIssueTypes(issueTypes, projectKey, sinceIso ? { sinceIso } : undefined);
    // Incremental: order by updated ASC so pagination stays stable across pages
    // even if more issues are updated mid-sync. Full sync keeps the historical
    // "created DESC" order the dashboard was tested against.
    jql += sinceIso ? ' ORDER BY updated ASC' : ' ORDER BY created DESC';

    const endpoint = `/rest/api/3/search/jql`;
    const { JIRA_API_CONFIG } = require('./jira-field-mappings.js');

    // In incremental mode the single consolidated JQL returns a mix of types,
    // so request the union of every type-specific field the processors need.
    const fieldsForQuery = sinceIso
      ? JIRA_API_CONFIG.getFieldsForIssueTypes(['Bug', 'Story', 'Test'])
      : JIRA_API_CONFIG.getFieldsForIssueTypes(issueTypes);

    const payload = {
      jql: jql,
      maxResults: maxResults,
      expand: JIRA_API_CONFIG.EXPAND_OPTIONS,
      fields: fieldsForQuery.split(',')
    };

    if (nextPageToken) {
      payload.nextPageToken = nextPageToken;
    }

    try {
      const response = await this.makePostRequest(endpoint, payload);
      return response;
    } catch (error) {
      console.error('Error fetching issues with pagination:', error);
      throw error;
    }
  }

  // Build JQL query for different issue types with selective filters.
  //
  // When opts.sinceIso is provided, appends `AND updated >= "..."` to the
  // same per-type scope filters used by a full sync. This means every issue
  // returned by an incremental sync is guaranteed in scope (JIRA-side
  // filter), so the merge step can safely upsert every row.
  //
  // Scope escapes (e.g., bug retyped off Production, story moved to
  // Cancelled) are NOT visible to incremental sync — by design — and get
  // reconciled on the next daily auto-full-sync. We previously tried to
  // broaden the incremental JQL and re-check scope client-side, but the
  // bugType extractor returns null for Production bugs (latent field-ID
  // mismatch in JIRA_FIELD_MAPPINGS.BUG_TYPE), which caused every returned
  // Production bug to be wrongly removed from the cache.
  buildJqlForIssueTypes(issueTypes, projectKey = null, opts = null) {
    if (issueTypes.length === 0) {
      throw new Error('At least one issue type must be specified');
    }

    const conditions = [];
    if (issueTypes.includes('Bug')) {
      conditions.push('type = Bug AND "bug type[dropdown]" = Production');
    }
    if (issueTypes.includes('Story')) {
      conditions.push('type = Story AND status NOT IN (Canceled, Rejected)');
    }
    if (issueTypes.includes('Test')) {
      conditions.push('type = "Test Case" AND status NOT IN (Canceled, Rejected)');
    }

    let baseJql;
    if (conditions.length === 0) {
      throw new Error('No recognized issue types');
    } else if (conditions.length === 1) {
      baseJql = conditions[0];
    } else {
      baseJql = conditions.map(c => `(${c})`).join(' OR ');
    }

    const sinceIso = opts && opts.sinceIso ? opts.sinceIso : null;
    if (sinceIso) {
      baseJql = `(${baseJql}) AND updated >= "${this._formatJqlDateTime(sinceIso)}"`;
    }

    if (projectKey) {
      baseJql = `(${baseJql}) AND project = "${projectKey}"`;
    }

    console.log(`🔍 JQL Query: ${baseJql}`);
    return baseJql;
  }

  // Convert an ISO timestamp to JIRA's JQL date format (minute precision).
  // Returns input as-is if it doesn't match the expected ISO shape (defensive
  // — callers should always pass a well-formed ISO string).
  _formatJqlDateTime(iso) {
    if (!iso) return iso;
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return iso;
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  }

  // PRESERVED: Original getBugs method (unchanged for backward compatibility)
  async getBugs(projectKey = null, maxResults = 100) {
    let jql = 'type = Bug AND "bug type[dropdown]" = Production';
    if (projectKey) {
      jql += ` AND project = "${projectKey}"`;
    }
    jql += ' ORDER BY created DESC';
    
    const endpoint = `/rest/api/3/search/jql`;
    const payload = {
      jql: jql,
      maxResults: maxResults,
      expand: 'changelog',
      fields: [
        'key', 'summary', 'status', 'priority', 'assignee', 'reporter', 
        'created', 'updated', 'resolution', 'description', 'components', 'labels',
        'customfield_10578', // Bug Type
        'customfield_10574', // Leading Team
        'customfield_10107', // System
        'customfield_10020', // Sprint
        'customfield_10106', // Regression
        'customfield_10104'  // Severity
      ]
    };
    
    try {
      const response = await this.makePostRequest(endpoint, payload);
      return response;
    } catch (error) {
      console.error('Error fetching bugs:', error.message);
      throw error;
    }
  }

  async getBugsWithTokenPagination(projectKey = null, maxResults = 100, nextPageToken = null) {
    let jql = 'type = Bug AND "bug type[dropdown]" = Production';
    if (projectKey) {
      jql += ` AND project = "${projectKey}"`;
    }
    jql += ' ORDER BY created DESC';
    
    const endpoint = `/rest/api/3/search/jql`;
    const payload = {
      jql: jql,
      maxResults: maxResults,
      expand: 'changelog',
      fields: [
        'key', 'summary', 'status', 'priority', 'assignee', 'reporter', 
        'created', 'updated', 'resolution', 'description', 'components', 'labels',
        'customfield_10578', // Bug Type
        'customfield_10574', // Leading Team
        'customfield_10107', // System
        'customfield_10020', // Sprint
        'customfield_10106', // Regression
        'customfield_10104'  // Severity
      ]
    };

    // Add nextPageToken if provided
    if (nextPageToken) {
      payload.nextPageToken = nextPageToken;
    }
    
    try {
      const response = await this.makePostRequest(endpoint, payload);
      return response;
    } catch (error) {
      console.error('Error fetching bugs with token pagination:', error.message);
      throw error;
    }
  }

  async getProjects() {
    try {
      const response = await this.makeRequest('/rest/api/3/project');
      return response;
    } catch (error) {
      console.error('Error fetching projects:', error.message);
      throw error;
    }
  }

  formatBugList(searchResponse) {
    if (!searchResponse.issues || searchResponse.issues.length === 0) {
      return 'No bugs found.';
    }

    const total = searchResponse.total || searchResponse.issues.length;
    console.log(`\nFound ${total} bugs (showing ${searchResponse.issues.length}):\n`);
    console.log('─'.repeat(120));
    
    searchResponse.issues.forEach((issue) => {
      console.log(`Key: ${issue.key}`);
      console.log(`Summary: ${issue.fields.summary}`);
      console.log(`Status: ${issue.fields.status.name}`);
      console.log(`Priority: ${issue.fields.priority ? issue.fields.priority.name : 'None'}`);
      console.log(`Assignee: ${issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned'}`);
      console.log(`Reporter: ${issue.fields.reporter ? issue.fields.reporter.displayName : 'Unknown'}`);
      console.log(`Created: ${new Date(issue.fields.created).toLocaleDateString()}`);
      console.log(`Updated: ${new Date(issue.fields.updated).toLocaleDateString()}`);
      
      if (issue.fields.description && issue.fields.description.content) {
        const description = this.extractTextFromADF(issue.fields.description);
        console.log(`Description: ${description.substring(0, 200)}${description.length > 200 ? '...' : ''}`);
      }
      
      console.log('─'.repeat(120));
    });

    return searchResponse;
  }

  extractTextFromADF(adfDocument) {
    // Extract text from Atlassian Document Format
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
}

// Usage function
async function main() {
  // Load credentials from .env file
  const env = loadEnv();
  
  const JIRA_DOMAIN = env.JIRA_DOMAIN || 'hibob.atlassian.net';
  const EMAIL = env.JIRA_EMAIL || 'guy.levin@hibob.io';
  const API_TOKEN = env.JIRA_API_TOKEN;
  
  if (!API_TOKEN || API_TOKEN === 'your-api-token-here') {
    console.error('❌ Please update your .env file with your actual Jira API token');
    console.error('📝 Edit the .env file and replace "your-api-token-here" with your actual token');
    console.error('🔑 You can find your token in the Atlassian extension settings');
    process.exit(1);
  }

  const jira = new JiraClient(JIRA_DOMAIN, EMAIL, API_TOKEN);

  try {
    console.log('Fetching projects...');
    const projects = await jira.getProjects();
    console.log('\nAvailable projects:');
    projects.forEach(project => {
      console.log(`- ${project.key}: ${project.name}`);
    });

    console.log('\nFetching all bugs...');
    const bugs = await jira.getBugs();
    jira.formatBugList(bugs);

    // You can also fetch bugs for a specific project:
    // const projectBugs = await jira.getBugs('PROJ'); // Replace 'PROJ' with actual project key
    // jira.formatBugList(projectBugs);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Export for use as module
module.exports = { JiraClient };

// Run if this file is executed directly
if (require.main === module) {
  main();
}