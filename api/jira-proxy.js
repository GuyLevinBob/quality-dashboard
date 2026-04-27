// Simple Node.js proxy server to handle JIRA API calls and avoid CORS
const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3001;

// JIRA credentials (in production, use environment variables)
const JIRA_CONFIG = {
    baseUrl: 'https://hibob.atlassian.net',
    email: 'guy.levin@hibob.io',
    token: 'ATATT3xFfGF0B9XbLpONas1I4ajySGn_mOUcj6U-7ckO2iSLB-xW2ma7Mb4WjaB_tHU7Qy7sXLHo_9-3pS5eaa6iLhkbscZJUiK_vZcxOTZ5KvHwg2ZWpFgnSTEK7N-0f5dw6a-EFShJKpMYUGmXcyxZERKXsdojohHsxXsDcWCiNqu-iVlJ5n8=FC8BCCBF'
};

const server = http.createServer((req, res) => {
    // Enable CORS for our frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (req.method === 'GET' && req.url.startsWith('/api/jira/')) {
        // Extract the JIRA path from our proxy URL
        // /api/jira/rest/api/2/issue/BT-737 -> /rest/api/2/issue/BT-737
        const jiraPath = req.url.replace('/api/jira', '');
        const jiraUrl = JIRA_CONFIG.baseUrl + jiraPath;
        
        console.log(`🔄 Proxying request to: ${jiraUrl}`);
        
        // Create HTTPS request to JIRA
        const options = {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${JIRA_CONFIG.email}:${JIRA_CONFIG.token}`).toString('base64')}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        };
        
        const jiraReq = https.request(jiraUrl, options, (jiraRes) => {
            let data = '';
            
            // Set response headers
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(jiraRes.statusCode);
            
            jiraRes.on('data', (chunk) => {
                data += chunk;
            });
            
            jiraRes.on('end', () => {
                console.log(`✅ JIRA response: ${jiraRes.statusCode}`);
                res.end(data);
            });
        });
        
        jiraReq.on('error', (error) => {
            console.error('❌ JIRA request error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy request failed', details: error.message }));
        });
        
        jiraReq.end();
        
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Proxy endpoint not found. Use /api/jira/...');
    }
});

server.listen(PORT, () => {
    console.log(`🚀 JIRA Proxy Server running on http://localhost:${PORT}`);
    console.log('📡 Ready to proxy requests to hibob.atlassian.net');
    console.log('🔗 Use URLs like: http://localhost:3001/api/jira/rest/api/2/issue/BT-737');
});