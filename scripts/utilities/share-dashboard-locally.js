#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000;
const dashboardFile = path.join(__dirname, 'bug-dashboard-embedded.html');

// Get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    return 'localhost';
}

// Create simple web server
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/dashboard') {
        try {
            const html = fs.readFileSync(dashboardFile, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading dashboard: ' + error.message);
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    const localIP = getLocalIP();
    
    console.log('🚀 HiBob Bug Dashboard Server Started!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📊 Dashboard URLs:');
    console.log(`   Local:    http://localhost:${PORT}/dashboard`);
    console.log(`   Network:  http://${localIP}:${PORT}/dashboard`);
    console.log('');
    console.log('📤 Share with your team:');
    console.log(`   Send this link: http://${localIP}:${PORT}/dashboard`);
    console.log('');
    console.log('⏹️  Press Ctrl+C to stop the server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down dashboard server...');
    server.close(() => {
        console.log('✅ Server stopped.');
        process.exit(0);
    });
});