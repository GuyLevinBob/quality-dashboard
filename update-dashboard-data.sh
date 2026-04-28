#!/bin/bash

# Dashboard Data Update Script
# This script helps update the GitHub Pages dashboard with fresh JIRA data
# 
# Usage:
#   ./update-dashboard-data.sh                 # Manual mode (interactive) - bugs only
#   ./update-dashboard-data.sh --auto          # Automated mode (for cron jobs) - bugs only
#   ./update-dashboard-data.sh --multi-issue   # Manual mode - multi-issue dashboard
#   ./update-dashboard-data.sh --auto --multi-issue # Automated mode - multi-issue dashboard

# Parse command line flags
AUTO_MODE=false
MULTI_ISSUE_MODE=false

for arg in "$@"; do
    case $arg in
        --auto)
            AUTO_MODE=true
            ;;
        --multi-issue)
            MULTI_ISSUE_MODE=true
            ;;
    esac
done

# Display mode information
if [ "$AUTO_MODE" = true ] && [ "$MULTI_ISSUE_MODE" = true ]; then
    echo "🤖 Running in AUTOMATED MULTI-ISSUE mode"
    echo "========================================"
    echo "$(date): Starting automated multi-issue dashboard update" >> ~/dashboard-update.log
elif [ "$AUTO_MODE" = true ]; then
    echo "🤖 Running in AUTOMATED mode (bugs only)"
    echo "========================================"
    echo "$(date): Starting automated dashboard update" >> ~/dashboard-update.log
elif [ "$MULTI_ISSUE_MODE" = true ]; then
    echo "🔄 HiBob Multi-Issue Dashboard Data Update Process"
    echo "================================================="
else
    echo "🔄 HiBob Dashboard Data Update Process (bugs only)"
    echo "================================================="
fi
echo

# Enable error handling for auto mode
if [ "$AUTO_MODE" = true ]; then
    set -e  # Exit on any error in auto mode
    trap 'echo "$(date): ERROR - Dashboard auto-update failed at line $LINENO" >> ~/dashboard-update.log' ERR
fi

# Check if we're in the correct directory
if [ ! -f "api/bug-api-server.js" ]; then
    echo "❌ Error: api/bug-api-server.js not found. Please run this script from the project root directory."
    exit 1
fi

# Check if API server is already running
if lsof -ti:3002 > /dev/null; then
    echo "⚠️  API server is already running on port 3002"
    if [ "$AUTO_MODE" = true ]; then
        echo "🤖 Auto mode: Continuing with existing server..."
        EXISTING_SERVER=true
    else
        read -p "Do you want to continue with the existing server? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ Process cancelled. Please stop the existing server first."
            exit 1
        fi
        EXISTING_SERVER=true
    fi
else
    echo "🚀 Starting local API server..."
    node api/bug-api-server.js &
    SERVER_PID=$!
    EXISTING_SERVER=false
    echo "✅ API server started (PID: $SERVER_PID)"
    sleep 3
fi

echo
if [ "$AUTO_MODE" = true ]; then
    if [ "$MULTI_ISSUE_MODE" = true ]; then
        echo "🤖 Triggering automated MULTI-ISSUE JIRA data sync..."
        
        # Wait a moment for API server to be ready
        sleep 2
        
        # Trigger multi-issue sync via API call
        echo "📡 Calling multi-issue sync API endpoint..."
        SYNC_RESPONSE=$(curl -s -X POST http://localhost:3002/api/sync-issues \
            -H "Content-Type: application/json" \
            -d '{"issueTypes": ["Bug", "Story", "Test"]}' \
            -w "\nHTTP_STATUS:%{http_code}" 2>/dev/null)
        
        HTTP_STATUS=$(echo "$SYNC_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
        SYNC_BODY=$(echo "$SYNC_RESPONSE" | sed '/HTTP_STATUS:/d')
        
        if [ "$HTTP_STATUS" = "200" ]; then
            echo "✅ Multi-issue sync completed successfully"
            echo "📊 Sync details: $SYNC_BODY"
            
            # Fetch the synced data and write to multi-dashboard-data.json
            echo "📁 Fetching synced multi-issue data..."
            DASHBOARD_DATA=$(curl -s -X GET http://localhost:3002/api/issues-lite?types=Bug,Story,Test 2>/dev/null)
            
            if [[ "$DASHBOARD_DATA" == *"issues"* ]]; then
                echo "$DASHBOARD_DATA" > multi-dashboard-data.json
                echo "✅ Updated multi-dashboard-data.json with fresh data"
                
                # Count issues in the file for verification
                ISSUE_COUNT=$(echo "$DASHBOARD_DATA" | grep -o '"key":"[A-Z]*-[0-9]*"' | wc -l | tr -d ' ')
                echo "📊 Multi-dashboard file now contains $ISSUE_COUNT issues"
            else
                echo "❌ Failed to fetch multi-issue dashboard data"
                echo "Error: $DASHBOARD_DATA"
                exit 1
            fi
        else
            echo "❌ Multi-issue sync failed (HTTP $HTTP_STATUS)"
            echo "Error details: $SYNC_BODY"
            exit 1
        fi
    else
        echo "🤖 Triggering automated JIRA data sync (bugs only)..."
        
        # Wait a moment for API server to be ready
        sleep 2
        
        # Trigger sync via API call
        echo "📡 Calling sync API endpoint..."
        SYNC_RESPONSE=$(curl -s -X POST http://localhost:3002/api/sync \
            -H "Content-Type: application/json" \
            -w "\nHTTP_STATUS:%{http_code}" 2>/dev/null)
        
        HTTP_STATUS=$(echo "$SYNC_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
        SYNC_BODY=$(echo "$SYNC_RESPONSE" | sed '/HTTP_STATUS:/d')
        
        if [ "$HTTP_STATUS" = "200" ]; then
            echo "✅ Sync completed successfully"
            echo "📊 Sync details: $SYNC_BODY"
            
            # Fetch the synced data and write to dashboard-data.json
            echo "📁 Fetching synced data for dashboard-data.json..."
            DASHBOARD_DATA=$(curl -s -X GET http://localhost:3002/api/bugs-lite 2>/dev/null)
            
            if [[ "$DASHBOARD_DATA" == *"bugs"* ]]; then
                echo "$DASHBOARD_DATA" > dashboard-data.json
                echo "✅ Updated dashboard-data.json with fresh data"
                
                # Count bugs in the file for verification
                BUG_COUNT=$(echo "$DASHBOARD_DATA" | grep -o '"id":"BT-[0-9]*"' | wc -l | tr -d ' ')
                echo "📊 Dashboard file now contains $BUG_COUNT bugs"
            else
                echo "❌ Failed to fetch dashboard data"
                echo "Error: $DASHBOARD_DATA"
                exit 1
            fi
        else
            echo "❌ Sync failed (HTTP $HTTP_STATUS)"
            echo "Error details: $SYNC_BODY"
            exit 1
        fi
    fi
    
    # Wait for file operations to complete
    sleep 1
    
else
    if [ "$MULTI_ISSUE_MODE" = true ]; then
        echo "📊 Next Steps (Multi-Issue Dashboard):"
        echo "1. Open your multi-issue dashboard: http://127.0.0.1:8090/dashboard-multi-issue.html"
        echo "2. Click the 'Sync Data' button to fetch fresh JIRA data"
        echo "3. Wait for the sync to complete (you'll see updated KPIs)"
        echo "4. Come back here and press Enter when sync is complete"
        echo
        
        read -p "Press Enter after completing the data sync in the multi-issue dashboard..."
    else
        echo "📊 Next Steps (Bug Dashboard):"
        echo "1. Open your dashboard: http://127.0.0.1:8090/dashboard-automated-fixed.html"
        echo "2. Click the 'Sync Data' button to fetch fresh JIRA data"
        echo "3. Wait for the sync to complete (you'll see updated KPIs)"
        echo "4. Come back here and press Enter when sync is complete"
        echo
        
        read -p "Press Enter after completing the data sync in the dashboard..."
    fi
fi

# Kill the server if we started it
if [ "$EXISTING_SERVER" = false ]; then
    echo "🛑 Stopping API server..."
    kill $SERVER_PID 2>/dev/null || echo "⚠️  Server may have already stopped"
fi

# Check if the appropriate data file was updated
if [ "$MULTI_ISSUE_MODE" = true ]; then
    DATA_FILE="multi-dashboard-data.json"
else
    DATA_FILE="dashboard-data.json"
fi

if [ -f "$DATA_FILE" ]; then
    FILE_SIZE=$(stat -f%z "$DATA_FILE" 2>/dev/null || stat -c%s "$DATA_FILE" 2>/dev/null)
    MODIFIED_TIME=$(stat -f%Sm "$DATA_FILE" 2>/dev/null || stat -c%y "$DATA_FILE" 2>/dev/null)
    echo "📊 Dashboard data file ($DATA_FILE): $(($FILE_SIZE / 1024))KB, modified: $MODIFIED_TIME"
else
    echo "❌ Warning: $DATA_FILE not found"
    exit 1
fi

echo
if [ "$AUTO_MODE" = true ]; then
    if [ "$MULTI_ISSUE_MODE" = true ]; then
        echo "🤖 Auto mode: Automatically deploying multi-issue dashboard to GitHub Pages..."
    else
        echo "🤖 Auto mode: Automatically deploying bug dashboard to GitHub Pages..."
    fi
    REPLY="y"
else
    if [ "$MULTI_ISSUE_MODE" = true ]; then
        read -p "Do you want to deploy the updated multi-issue data to GitHub Pages? (y/n): " -n 1 -r
    else
        read -p "Do you want to deploy the updated data to GitHub Pages? (y/n): " -n 1 -r
    fi
    echo
fi

if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ "$MULTI_ISSUE_MODE" = true ]; then
        echo "🚀 Deploying updated multi-issue data to GitHub Pages..."
        DASHBOARD_TYPE="multi-issue"
        DASHBOARD_URL="dashboard-multi-issue.html"
    else
        echo "🚀 Deploying updated bug data to GitHub Pages..."
        DASHBOARD_TYPE="bug"
        DASHBOARD_URL="dashboard-automated-fixed.html"
    fi
    
    # Add the updated file to git
    git add "$DATA_FILE"
    
    # Check if there are changes to commit
    if git diff --staged --quiet; then
        echo "ℹ️  No changes detected in $DATA_FILE"
    else
        # Create commit with timestamp
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
        git commit -m "Update $DASHBOARD_TYPE dashboard data - $TIMESTAMP

- Synced fresh JIRA data from $([ "$MULTI_ISSUE_MODE" = true ] && echo "multi-issue" || echo "bug")-api-server
- File: $DATA_FILE ($(($FILE_SIZE / 1024))KB)
- Updated for management access"

        echo "📤 Pushing to GitHub..."
        git push || git push --set-upstream origin main
        
        echo
        echo "✅ Dashboard data updated successfully!"
        echo "🌐 GitHub Pages will deploy the update in 1-2 minutes"
        echo "🔗 Your dashboard: https://guylevinbob.github.io/quality-dashboard/$DASHBOARD_URL"
    fi
else
    echo "ℹ️  Deployment cancelled. Updated data is available locally."
fi

echo
echo "📋 Update Complete Summary:"
echo "- Dashboard type: $([ "$MULTI_ISSUE_MODE" = true ] && echo "Multi-Issue (Bugs, Stories, Tests)" || echo "Bug Dashboard")"
echo "- Local data: ✅ Updated"
echo "- GitHub deployment: $([ $REPLY = 'y' ] && echo '✅ Deployed' || echo '⏸️  Skipped')"
if [ "$MULTI_ISSUE_MODE" = true ]; then
    echo "- Managers can access: https://guylevinbob.github.io/quality-dashboard/dashboard-multi-issue.html"
else
    echo "- Managers can access: https://guylevinbob.github.io/quality-dashboard/dashboard-automated-fixed.html"
fi

if [ "$AUTO_MODE" = true ]; then
    if [ "$MULTI_ISSUE_MODE" = true ]; then
        echo "- Auto mode (multi-issue): ✅ Completed at $(date)"
        echo "$(date): Multi-issue dashboard auto-update completed successfully" >> ~/dashboard-update.log
    else
        echo "- Auto mode (bugs): ✅ Completed at $(date)"
        echo "$(date): Dashboard auto-update completed successfully" >> ~/dashboard-update.log
    fi
else
    echo
    echo "💡 Recommended update frequency:"
    echo "   - Before important meetings"
    echo "   - Weekly for regular management reviews"
    echo "   - Monthly for comprehensive reports"
    if [ "$MULTI_ISSUE_MODE" = true ]; then
        echo "   - Use --multi-issue flag for comprehensive analytics"
    else
        echo "   - Use --multi-issue flag for comprehensive multi-issue analytics"
    fi
fi