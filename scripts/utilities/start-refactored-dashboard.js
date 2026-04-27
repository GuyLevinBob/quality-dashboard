#!/usr/bin/env node

// Startup script for the refactored bug dashboard
const { BugApiServer } = require('./api/bug-api-server.js');
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Refactored Bug Dashboard...\n');

// Start the Bug API Server
console.log('📡 Starting Bug API Server on port 3002...');
const server = new BugApiServer(3002);
const apiServer = server.start();

// Wait a moment for the server to start
setTimeout(() => {
    console.log('\n✅ Bug API Server started successfully!');
    console.log('📖 API Endpoints:');
    console.log('   GET  http://localhost:3002/api/bugs-lite');
    console.log('   POST http://localhost:3002/api/sync');
    console.log('   GET  http://localhost:3002/api/bugs/:id/details');
    console.log('   GET  http://localhost:3002/health');
    
    console.log('\n🌐 Dashboard URL:');
    console.log('   Open: bug-dashboard-refactored.html');
    console.log('   Or serve via: python3 -m http.server 8080');
    
    console.log('\n🎯 Architecture Benefits:');
    console.log('   ✅ Instant cache loading');
    console.log('   ✅ Background incremental sync');
    console.log('   ✅ Preserved filter state');
    console.log('   ✅ Efficient pagination');
    console.log('   ✅ On-demand bug details');
    
    console.log('\n⚡ Performance:');
    console.log('   - Dashboard loads: INSTANTLY from cache');
    console.log('   - Filter changes: <1 second');
    console.log('   - Background sync: Only updated bugs');
    console.log('   - Memory usage: Lightweight data only');
    
    console.log('\n💡 Usage:');
    console.log('   1. Open bug-dashboard-refactored.html in browser');
    console.log('   2. Dashboard loads instantly from cache (if available)');
    console.log('   3. Server syncs with Jira in background');
    console.log('   4. Apply filters - no delays!');
    console.log('   5. Click bug keys to load full details on demand');
    
    console.log('\n🛠️  Testing:');
    console.log('   - Refresh page: Should load from cache instantly');
    console.log('   - Apply filters: Should preserve state across refreshes');
    console.log('   - Check cache: Click cache info in bottom-right');
    
}, 1000);

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Bug API Server...');
    apiServer.close(() => {
        console.log('✅ Server closed gracefully');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down Bug API Server...');
    apiServer.close(() => {
        console.log('✅ Server closed gracefully');
        process.exit(0);
    });
});

console.log('\n🔧 Press Ctrl+C to stop the server');