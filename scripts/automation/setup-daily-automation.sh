#!/bin/bash

# Setup Daily Automation for Dashboard Updates
# Runs at 6 AM Israel time (4 AM UTC) every day

PROJECT_DIR=$(pwd)
CRON_COMMAND="0 4 * * * cd $PROJECT_DIR && npm run daily-update >> $PROJECT_DIR/automation.log 2>&1"

echo "🕕 Setting up daily dashboard automation for 6 AM Israel time"
echo "📂 Project directory: $PROJECT_DIR"
echo ""

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "daily-update"; then
    echo "⚠️  Cron job already exists. Removing old one..."
    crontab -l 2>/dev/null | grep -v "daily-update" | crontab -
fi

# Add new cron job
echo "📅 Adding daily cron job (6 AM Israel time = 4 AM UTC)..."
(crontab -l 2>/dev/null; echo "$CRON_COMMAND") | crontab -

if [ $? -eq 0 ]; then
    echo "✅ Daily automation setup complete!"
    echo ""
    echo "📋 Summary:"
    echo "   • Runs daily at 6 AM Israel time (4 AM UTC)"
    echo "   • Exports fresh JIRA data using your local .env"
    echo "   • Updates dashboard automatically"  
    echo "   • Pushes changes to GitHub"
    echo "   • Your team sees updated dashboard"
    echo ""
    echo "📄 Log file: $PROJECT_DIR/automation.log"
    echo ""
    echo "🔧 Management commands:"
    echo "   View cron jobs:     crontab -l"
    echo "   Remove automation:  crontab -l | grep -v daily-update | crontab -"
    echo "   Test manually:      npm run daily-update"
    echo "   View logs:          tail -f automation.log"
    echo ""
    echo "🎯 Your team dashboard: https://guylevinbob.github.io/quality-dashboard/dashboard-automated.html"
    
else
    echo "❌ Failed to setup cron job"
    echo "💡 You may need to run: sudo ./setup-daily-automation.sh"
fi