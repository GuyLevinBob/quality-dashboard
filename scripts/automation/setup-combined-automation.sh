#!/bin/bash

# Combined Automation Setup for Both Dashboards
# Sets up daily automation for both Bug Dashboard and Multi-Issue Dashboard

PROJECT_DIR=$(pwd)

echo "🚀 HiBob Analytics Platform - Combined Automation Setup"
echo "======================================================="
echo "📂 Project directory: $PROJECT_DIR"
echo ""
echo "This will set up automated daily updates for both dashboards:"
echo "  🐛 Bug Dashboard: 6 AM Israel (fast production focus)"
echo "  📊 Multi-Issue Dashboard: 7 AM Israel (comprehensive analytics)"
echo ""

read -p "Continue with setup? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Setup cancelled."
    exit 0
fi

echo "📅 Setting up automation schedules..."
echo ""

# Bug Dashboard Cron Job
BUG_CRON="0 4 * * * cd $PROJECT_DIR && npm run daily-update >> $PROJECT_DIR/automation.log 2>&1"
MULTI_CRON="0 5 * * * cd $PROJECT_DIR && npm run multi-issue-update >> $PROJECT_DIR/multi-issue-automation.log 2>&1"

# Remove existing cron jobs for these automations
echo "🧹 Removing any existing automation cron jobs..."
crontab -l 2>/dev/null | grep -v "daily-update" | grep -v "multi-issue-update" | crontab -

# Add both cron jobs
echo "📅 Adding bug dashboard cron job (6 AM Israel = 4 AM UTC)..."
(crontab -l 2>/dev/null; echo "$BUG_CRON") | crontab -

echo "📅 Adding multi-issue dashboard cron job (7 AM Israel = 5 AM UTC)..."
(crontab -l 2>/dev/null; echo "$MULTI_CRON") | crontab -

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Combined automation setup complete!"
    echo ""
    echo "📋 Daily Schedule:"
    echo "   🕕 6:00 AM - Bug Dashboard Update"
    echo "      • Fast production bug sync"
    echo "      • Critical issue tracking"
    echo "      • Team notifications"
    echo ""
    echo "   🕖 7:00 AM - Multi-Issue Dashboard Update"
    echo "      • Comprehensive data sync (Bugs, Stories, Tests)"
    echo "      • Testing coverage analytics"
    echo "      • Management-ready insights"
    echo ""
    echo "📊 Data Processing:"
    echo "   🔒 Local JIRA sync (credentials stay secure)"
    echo "   🧽 Data anonymization for GitHub Pages"
    echo "   📤 Automatic GitHub deployment"
    echo "   🌐 Team access via GitHub Pages"
    echo ""
    echo "📄 Log Files:"
    echo "   Bug Dashboard: $PROJECT_DIR/automation.log"
    echo "   Multi-Issue:   $PROJECT_DIR/multi-issue-automation.log"
    echo ""
    echo "🌐 Team Dashboard URLs:"
    echo "   Landing Page:     https://guylevinbob.github.io/quality-dashboard/"
    echo "   Bug Dashboard:    https://guylevinbob.github.io/quality-dashboard/dashboard-automated-fixed.html"
    echo "   Multi-Issue:      https://guylevinbob.github.io/quality-dashboard/dashboard-multi-issue.html"
    echo ""
    echo "🔧 Management Commands:"
    echo "   View all cron jobs:        crontab -l"
    echo "   Test bug dashboard:        npm run daily-update"
    echo "   Test multi-issue:          npm run multi-issue-update"
    echo "   Manual bug update:         npm run update-dashboard"
    echo "   Manual multi-update:       npm run update-multi-dashboard"
    echo "   View bug logs:             tail -f automation.log"
    echo "   View multi-issue logs:     tail -f multi-issue-automation.log"
    echo ""
    echo "🗑️  Remove Automation:"
    echo "   Remove bug automation:     crontab -l | grep -v daily-update | crontab -"
    echo "   Remove multi-issue:        crontab -l | grep -v multi-issue-update | crontab -"
    echo "   Remove both:               crontab -r"
    echo ""
    echo "✨ Setup complete! Both dashboards will update automatically every morning."
    echo "   Your team will have access to fresh analytics when they start work."
    
else
    echo "❌ Failed to setup cron jobs"
    echo "💡 You may need to run: sudo ./setup-combined-automation.sh"
    echo "   Or setup individually:"
    echo "   ./setup-daily-automation.sh"
    echo "   ./setup-multi-issue-automation.sh"
fi