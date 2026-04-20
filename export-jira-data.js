const { JiraClient } = require('./jira-bugs.js');
const fs = require('fs');
const path = require('path');

// Simple .env file parser
function loadEnv() {
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
    console.error('Error reading .env file:', error.message);
    return {};
  }
}

function calculateDaysOpen(createdDate) {
  const created = new Date(createdDate);
  const now = new Date();
  const diffTime = Math.abs(now - created);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function extractProjectFromKey(key) {
  return key.split('-')[0];
}

function processBugData(bugs) {
  const processed = bugs.issues.map(issue => {
    const created = issue.fields.created;
    const updated = issue.fields.updated;
    
    // Extract bug type field (customfield_10578)
    let bugType = null;
    if (issue.fields.customfield_10578) {
      bugType = issue.fields.customfield_10578.value || issue.fields.customfield_10578;
    }
    
    // Extract leading team field (customfield_10574)
    let leadingTeam = null;
    if (issue.fields.customfield_10574) {
      leadingTeam = issue.fields.customfield_10574.value || issue.fields.customfield_10574;
    }
    
    // Extract system field (customfield_10107)
    let system = null;
    if (issue.fields.customfield_10107) {
      system = issue.fields.customfield_10107.value || issue.fields.customfield_10107;
    }
    
    // Extract regression field (customfield_10106)
    let regression = null;
    if (issue.fields.customfield_10106) {
      if (Array.isArray(issue.fields.customfield_10106)) {
        regression = issue.fields.customfield_10106.length > 0 ? 
          (issue.fields.customfield_10106[0].value || issue.fields.customfield_10106[0]) : null;
      } else {
        regression = issue.fields.customfield_10106.value || issue.fields.customfield_10106;
      }
    }
    
    // Extract severity field (customfield_10104)
    let severity = null;
    if (issue.fields.customfield_10104) {
      severity = issue.fields.customfield_10104.value || issue.fields.customfield_10104;
    }
    
    // Extract sprint field (customfield_10020)
    let sprint = null;
    if (issue.fields.customfield_10020 && Array.isArray(issue.fields.customfield_10020) && issue.fields.customfield_10020.length > 0) {
      // Get the most recent sprint (last in array)
      const latestSprint = issue.fields.customfield_10020[issue.fields.customfield_10020.length - 1];
      sprint = latestSprint.name || null;
    }
    
    return {
      key: issue.key,
      project: extractProjectFromKey(issue.key),
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      priority: issue.fields.priority ? issue.fields.priority.name : 'None',
      severity: severity,
      assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
      reporter: issue.fields.reporter ? issue.fields.reporter.displayName : 'Unknown',
      leadingTeam: leadingTeam,
      system: system,
      sprint: sprint,
      regression: regression,
      created: created,
      updated: updated,
      createdDate: new Date(created).toLocaleDateString(),
      updatedDate: new Date(updated).toLocaleDateString(),
      daysOpen: calculateDaysOpen(created),
      bugType: bugType,
      description: issue.fields.description ? extractTextFromADF(issue.fields.description) : ''
    };
  });

  return processed;
}

function extractTextFromADF(adfDocument) {
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

function generateSummaryStats(bugs) {
  const stats = {
    totalBugs: bugs.length,
    byProject: {},
    byStatus: {},
    byPriority: {},
    byAssignee: {},
    averageDaysOpen: 0,
    oldestBug: null,
    newestBug: null
  };

  let totalDays = 0;
  let oldestDays = 0;
  let newestDays = Infinity;

  bugs.forEach(bug => {
    // Project stats
    stats.byProject[bug.project] = (stats.byProject[bug.project] || 0) + 1;
    
    // Status stats
    stats.byStatus[bug.status] = (stats.byStatus[bug.status] || 0) + 1;
    
    // Priority stats
    stats.byPriority[bug.priority] = (stats.byPriority[bug.priority] || 0) + 1;
    
    // Assignee stats
    stats.byAssignee[bug.assignee] = (stats.byAssignee[bug.assignee] || 0) + 1;
    
    // Days open stats
    totalDays += bug.daysOpen;
    if (bug.daysOpen > oldestDays) {
      oldestDays = bug.daysOpen;
      stats.oldestBug = bug;
    }
    if (bug.daysOpen < newestDays) {
      newestDays = bug.daysOpen;
      stats.newestBug = bug;
    }
  });

  stats.averageDaysOpen = Math.round(totalDays / bugs.length);
  
  return stats;
}

async function main() {
  const env = loadEnv();
  
  const JIRA_DOMAIN = env.JIRA_DOMAIN || 'hibob.atlassian.net';
  const EMAIL = env.JIRA_EMAIL || 'guy.levin@hibob.io';
  const API_TOKEN = env.JIRA_API_TOKEN;
  
  if (!API_TOKEN || API_TOKEN === 'your-api-token-here') {
    console.error('❌ Please update your .env file with your actual Jira API token');
    process.exit(1);
  }

  const jira = new JiraClient(JIRA_DOMAIN, EMAIL, API_TOKEN);

  try {
    console.log('🔍 Fetching all bugs (this may take a moment)...');
    
    // Get ALL bugs using token-based pagination
    const allBugs = [];
    let nextPageToken = null;
    const maxResults = 100; // Jira's safe limit per request
    let pageNumber = 1;
    let response;
    
    do {
      console.log(`🔍 Fetching bugs page ${pageNumber}...`);
      response = await jira.getBugsWithTokenPagination(null, maxResults, nextPageToken);
      
      if (response.issues && response.issues.length > 0) {
        allBugs.push(...response.issues);
        
        console.log(`   ✅ Got ${response.issues.length} bugs (${allBugs.length} total so far)`);
        console.log(`   📄 Page ${pageNumber} complete. More pages: ${!response.isLast}`);
        
        // Check if there are more pages
        if (response.isLast) {
          console.log('   🏁 Reached last page!');
          break;
        }
        
        nextPageToken = response.nextPageToken;
        pageNumber++;
      } else {
        console.log('   ℹ️  No more bugs found');
        break;
      }
      
      // Safety check to avoid infinite loops
      if (pageNumber > 100) {
        console.log('⚠️  Reached safety limit of 100 pages');
        break;
      }
      
    } while (!response.isLast && nextPageToken);
    
    console.log(`📊 Retrieved ${allBugs.length} bugs total across ${pageNumber} pages`);
    
    // Process the data
    const processedBugs = processBugData({ issues: allBugs });
    const stats = generateSummaryStats(processedBugs);
    
    // Create the data object
    const dashboardData = {
      metadata: {
        exported: new Date().toISOString(),
        totalBugs: allBugs.length,
        projects: Object.keys(stats.byProject),
        jiraInstance: JIRA_DOMAIN
      },
      bugs: processedBugs,
      stats: stats
    };
    
    // Write to JSON file
    const outputFile = path.join(__dirname, 'jira-bugs-data.json');
    fs.writeFileSync(outputFile, JSON.stringify(dashboardData, null, 2));
    
    console.log(`✅ Data exported to: ${outputFile}`);
    console.log('\n📊 Summary Stats:');
    console.log(`   Total Bugs: ${stats.totalBugs}`);
    console.log(`   Projects: ${Object.keys(stats.byProject).join(', ')}`);
    console.log(`   Average Days Open: ${stats.averageDaysOpen} days`);
    console.log(`   Oldest Bug: ${stats.oldestBug.key} (${stats.oldestBug.daysOpen} days)`);
    
    console.log('\n🏢 Bugs by Project:');
    Object.entries(stats.byProject).forEach(([project, count]) => {
      console.log(`   ${project}: ${count} bugs`);
    });
    
    console.log('\n📋 Bugs by Status:');
    Object.entries(stats.byStatus).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} bugs`);
    });
    
    console.log('\n⚡ Bugs by Priority:');
    Object.entries(stats.byPriority).forEach(([priority, count]) => {
      console.log(`   ${priority}: ${count} bugs`);
    });
    
    console.log('\n🎯 Ready for dashboard creation!');
    
    return dashboardData;

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { processBugData, generateSummaryStats };