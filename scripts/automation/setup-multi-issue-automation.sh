#!/bin/bash

# Setup Multi-Issue Dashboard Daily Automation 
# Runs at 7 AM Israel time (5 AM UTC) every day for comprehensive analytics

PROJECT_DIR=$(pwd)
CRON_COMMAND="0 5 * * * cd $PROJECT_DIR && npm run multi-issue-update >> $PROJECT_DIR/multi-issue-automation.log 2>&1"

echo "🕖 Setting up multi-issue dashboard automation for 7 AM Israel time"
echo "📊 Comprehensive analytics: Bugs, Stories, and Test Cases"
echo "📂 Project directory: $PROJECT_DIR"
echo ""

# Check if multi-issue cron job already exists
if crontab -l 2>/dev/null | grep -q "multi-issue-update"; then
    echo "⚠️  Multi-issue cron job already exists. Removing old one..."
    crontab -l 2>/dev/null | grep -v "multi-issue-update" | crontab -
fi

# Add new cron job
echo "📅 Adding multi-issue daily cron job (7 AM Israel time = 5 AM UTC)..."
(crontab -l 2>/dev/null; echo "$CRON_COMMAND") | crontab -

if [ $? -eq 0 ]; then
    echo "✅ Multi-issue automation setup complete!"
    echo ""
    echo "📋 Summary:"
    echo "   • Runs daily at 7 AM Israel time (5 AM UTC)"
    echo "   • Exports comprehensive JIRA data (Bugs, Stories, Tests)"
    echo "   • Creates anonymized version for GitHub Pages"  
    echo "   • Updates multi-dashboard-data.json automatically"
    echo "   • Pushes changes to GitHub for team access"
    echo ""
    echo "📊 Data Coverage:"
    echo "   ✅ Production Bugs with severity tracking"
    echo "   ✅ User Stories with test case creation tracking"
    echo "   ✅ Test Cases with AI generation tracking"
    echo "   ✅ Testing Coverage Analytics"
    echo ""
    echo "📄 Log file: $PROJECT_DIR/multi-issue-automation.log"
    echo ""
    echo "🔧 Management commands:"
    echo "   View cron jobs:        crontab -l"
    echo "   Remove automation:     crontab -l | grep -v multi-issue-update | crontab -"
    echo "   Test manually:         npm run multi-issue-update"
    echo "   View logs:             tail -f multi-issue-automation.log"
    echo "   Update manually:       npm run update-multi-dashboard"
    echo ""
    echo "🌐 Team Dashboard URLs:"
    echo "   Multi-Issue Analytics: https://guylevinbob.github.io/quality-dashboard/dashboard-multi-issue.html"
    echo "   Bug Analytics (Fast):  https://guylevinbob.github.io/quality-dashboard/dashboard-automated-fixed.html"
    echo "   Landing Page:          https://guylevinbob.github.io/quality-dashboard/"
    echo ""
    echo "💡 Pro Tip: Run both automations for complete coverage:"
    echo "   • Bug Dashboard (6 AM): Fast production issue updates"
    echo "   • Multi-Issue (7 AM): Comprehensive analytics for meetings"
    
else
    echo "❌ Failed to setup multi-issue cron job"
    echo "💡 You may need to run: sudo ./setup-multi-issue-automation.sh"
fi