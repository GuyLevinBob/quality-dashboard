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

async function testConnection() {
  // Load credentials from .env file
  const env = loadEnv();
  
  const JIRA_DOMAIN = env.JIRA_DOMAIN || 'hibob.atlassian.net';
  const EMAIL = env.JIRA_EMAIL || 'guy.levin@hibob.io';
  const API_TOKEN = env.JIRA_API_TOKEN;
  
  if (!API_TOKEN || API_TOKEN === 'your-api-token-here') {
    console.log('❌ Please update your .env file with your actual Jira API token');
    console.log('📝 Edit the .env file and replace "your-api-token-here" with your actual token');
    console.log('🔑 You can find your token in the Atlassian extension settings');
    return;
  }

  const jira = new JiraClient(JIRA_DOMAIN, EMAIL, API_TOKEN);

  try {
    console.log('🔍 Testing connection to Jira...');
    
    // Test with a simple project fetch first
    const projects = await jira.getProjects();
    console.log('✅ Connection successful!');
    console.log(`📋 Found ${projects.length} projects:`);
    
    projects.slice(0, 5).forEach(project => {
      console.log(`   - ${project.key}: ${project.name}`);
    });
    
    if (projects.length > 5) {
      console.log(`   ... and ${projects.length - 5} more`);
    }
    
    console.log('\n🐛 Testing bug retrieval (first 5)...');
    const bugs = await jira.getBugs(null, 5);
    
    if (bugs.issues && bugs.issues.length > 0) {
      const total = bugs.total || bugs.issues.length;
      console.log(`✅ Found ${total} total bugs (showing first ${bugs.issues.length}):`);
      bugs.issues.forEach(issue => {
        console.log(`   - ${issue.key}: ${issue.fields.summary}`);
        console.log(`     Status: ${issue.fields.status.name}`);
      });
    } else {
      console.log('ℹ️  No bugs found');
    }

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    
    if (error.message.includes('401')) {
      console.log('💡 This looks like an authentication issue. Please check:');
      console.log('   - Your API token is correct');
      console.log('   - Your email address is correct');
    } else if (error.message.includes('403')) {
      console.log('💡 This looks like a permissions issue. Please check:');
      console.log('   - Your account has access to Jira');
      console.log('   - Your API token has the right permissions');
    }
  }
}

testConnection();