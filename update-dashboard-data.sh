#!/bin/bash

# Dashboard Data Update Script
# This script helps update the GitHub Pages dashboard with fresh JIRA data

echo "🔄 HiBob Dashboard Data Update Process"
echo "======================================"
echo

# Check if we're in the correct directory
if [ ! -f "bug-api-server.js" ]; then
    echo "❌ Error: bug-api-server.js not found. Please run this script from the project root directory."
    exit 1
fi

# Check if API server is already running
if lsof -ti:3002 > /dev/null; then
    echo "⚠️  API server is already running on port 3002"
    read -p "Do you want to continue with the existing server? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Process cancelled. Please stop the existing server first."
        exit 1
    fi
    EXISTING_SERVER=true
else
    echo "🚀 Starting local API server..."
    node bug-api-server.js &
    SERVER_PID=$!
    EXISTING_SERVER=false
    echo "✅ API server started (PID: $SERVER_PID)"
    sleep 3
fi

echo
echo "📊 Next Steps:"
echo "1. Open your dashboard: http://127.0.0.1:8090/dashboard-automated-fixed.html"
echo "2. Click the 'Sync Data' button to fetch fresh JIRA data"
echo "3. Wait for the sync to complete (you'll see updated KPIs)"
echo "4. Come back here and press Enter when sync is complete"
echo

read -p "Press Enter after completing the data sync in the dashboard..."

# Kill the server if we started it
if [ "$EXISTING_SERVER" = false ]; then
    echo "🛑 Stopping API server..."
    kill $SERVER_PID 2>/dev/null || echo "⚠️  Server may have already stopped"
fi

# Check if dashboard-data.json was updated
if [ -f "dashboard-data.json" ]; then
    FILE_SIZE=$(stat -f%z dashboard-data.json 2>/dev/null || stat -c%s dashboard-data.json 2>/dev/null)
    MODIFIED_TIME=$(stat -f%Sm dashboard-data.json 2>/dev/null || stat -c%y dashboard-data.json 2>/dev/null)
    echo "📊 Dashboard data file: $(($FILE_SIZE / 1024))KB, modified: $MODIFIED_TIME"
else
    echo "❌ Warning: dashboard-data.json not found"
    exit 1
fi

echo
read -p "Do you want to deploy the updated data to GitHub Pages? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Deploying updated data to GitHub Pages..."
    
    # Add the updated file to git
    git add dashboard-data.json
    
    # Check if there are changes to commit
    if git diff --staged --quiet; then
        echo "ℹ️  No changes detected in dashboard-data.json"
    else
        # Create commit with timestamp
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
        git commit -m "Update dashboard data - $TIMESTAMP

- Synced fresh JIRA data from bug-api-server
- File size: $(($FILE_SIZE / 1024))KB
- Updated for management access"

        echo "📤 Pushing to GitHub..."
        git push
        
        echo
        echo "✅ Dashboard data updated successfully!"
        echo "🌐 GitHub Pages will deploy the update in 1-2 minutes"
        echo "🔗 Your dashboard: https://guylevinbob.github.io/quality-dashboard/"
    fi
else
    echo "ℹ️  Deployment cancelled. Updated data is available locally."
fi

echo
echo "📋 Update Complete Summary:"
echo "- Local data: ✅ Updated"
echo "- GitHub deployment: $([ $REPLY = 'y' ] && echo '✅ Deployed' || echo '⏸️  Skipped')"
echo "- Managers can access: https://guylevinbob.github.io/quality-dashboard/"
echo
echo "💡 Recommended update frequency:"
echo "   - Before important meetings"
echo "   - Weekly for regular management reviews"
echo "   - Monthly for comprehensive reports"