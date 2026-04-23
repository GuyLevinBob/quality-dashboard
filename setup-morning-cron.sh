#!/bin/bash

# Cron Job Setup Script for Morning Dashboard Updates
# This script helps you set up automated morning updates

echo "⏰ Morning Dashboard Update - Cron Job Setup"
echo "============================================="
echo

# Get the current directory (project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "📍 Project directory: $SCRIPT_DIR"
echo "🕘 Setting up weekday morning updates (9:00 AM, Mon-Fri)"
echo

# Create the cron job entry
CRON_ENTRY="0 9 * * 1-5 cd $SCRIPT_DIR && ./update-dashboard-data.sh --auto >> ~/dashboard-update.log 2>&1"

echo "📝 Cron job entry to be added:"
echo "$CRON_ENTRY"
echo

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "update-dashboard-data.sh --auto"; then
    echo "⚠️  Cron job already exists!"
    echo "Current dashboard cron jobs:"
    crontab -l 2>/dev/null | grep "update-dashboard-data.sh"
    echo
    read -p "Do you want to replace the existing entry? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled."
        exit 0
    fi
    
    # Remove existing entries
    crontab -l 2>/dev/null | grep -v "update-dashboard-data.sh" | crontab -
    echo "✅ Removed existing dashboard cron jobs"
fi

# Add the new cron job
(crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -

echo "✅ Cron job added successfully!"
echo
echo "📋 Summary:"
echo "- Schedule: Every weekday at 9:00 AM"
echo "- Command: $SCRIPT_DIR/update-dashboard-data.sh --auto"
echo "- Log file: ~/dashboard-update.log"
echo
echo "🧪 Test the setup:"
echo "1. Test auto mode manually: ./update-dashboard-data.sh --auto"
echo "2. Check cron jobs: crontab -l"
echo "3. Monitor logs: tail -f ~/dashboard-update.log"
echo
echo "🗑️  To remove later: crontab -e (then delete the line)"
echo
echo "⚠️  Important: Keep your computer running and connected in the mornings!"