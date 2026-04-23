# HiBob Dashboard Update Guide

## Overview

This guide explains how to update the production dashboard with fresh JIRA data for cross-team access.

## Two-Environment Setup

### Local Development (Your Daily Work)
- **URL**: `http://127.0.0.1:8090/dashboard-automated-fixed.html`
- **Features**: Live JIRA sync, real-time data, full functionality
- **Usage**: Your regular development and analysis work

### Production Dashboard (Manager Access)  
- **URL**: `https://guylevinbob.github.io/quality-dashboard/`
- **Features**: Static dashboard with real JIRA data
- **Updates**: Manual sync process (documented below)

## Update Methods

### Method 1: Automated Morning Updates (Recommended)

Set up once, runs automatically every weekday morning:

```bash
# One-time setup for morning automation
./setup-morning-cron.sh
```

**What it does:**
- Runs every weekday at 9:00 AM automatically
- Syncs fresh JIRA data without manual intervention
- Deploys to GitHub Pages automatically
- Logs results to `~/dashboard-update.log`

**Benefits:**
- ✅ Managers always see fresh data
- ✅ No need to remember manual updates  
- ✅ Consistent daily refresh schedule
- ✅ Logs track update success/failure

### Method 2: Manual Updates (On-Demand)

For immediate updates or testing:

```bash
# Manual interactive mode
./update-dashboard-data.sh

# Manual automated mode (no prompts)
./update-dashboard-data.sh --auto
```

**Interactive Mode:**
1. ✅ Start the local API server (if needed)
2. ✅ Guide you through the sync process  
3. ✅ Ask for deployment confirmation
4. ✅ Provide status and next steps

**Auto Mode:**
1. ✅ Fully automated (no user input required)
2. ✅ Direct API sync (no manual button clicking)
3. ✅ Auto-deploys to GitHub Pages
4. ✅ Logs results for tracking

### Manual Method (Step by Step)

If you prefer manual control or troubleshooting:

#### Step 1: Start Local Environment
```bash
# Start API server (if not running)
node bug-api-server.js
```

#### Step 2: Sync Fresh Data
1. Open: `http://127.0.0.1:8090/dashboard-automated-fixed.html`
2. Click **"Sync Data"** button
3. Wait for sync completion (KPIs will update)
4. Verify data freshness in the dashboard

#### Step 3: Deploy to Production
```bash
# Add updated data file
git add dashboard-data.json

# Commit with descriptive message
git commit -m "Update dashboard data - $(date)"

# Push to GitHub Pages
git push
```

#### Step 4: Verify Deployment
- Wait 1-2 minutes for GitHub Pages deployment
- Visit: `https://guylevinbob.github.io/quality-dashboard/`
- Verify managers see updated data

## Managing Automation

### Monitoring Morning Updates

**Check Update Status:**
```bash
# View recent update logs
tail -20 ~/dashboard-update.log

# Monitor live updates
tail -f ~/dashboard-update.log

# Check if updates are working
grep "$(date +%Y-%m-%d)" ~/dashboard-update.log
```

**Verify Cron Job:**
```bash
# List all cron jobs
crontab -l

# Edit cron jobs (if needed)
crontab -e
```

### Disable/Enable Automation

**Temporarily Disable:**
```bash
# Comment out the cron job
crontab -e
# Add # at the beginning of the dashboard line
```

**Permanently Remove:**
```bash
# Remove dashboard cron job
crontab -l | grep -v "update-dashboard-data.sh" | crontab -
```

**Re-enable:**
```bash
# Run setup script again
./setup-morning-cron.sh
```

## Update Frequency Recommendations

### With Morning Automation (Recommended)
- **Daily**: Automatic updates at 9:00 AM (weekdays)
- **Ad-hoc**: Manual updates for urgent changes
- **Before meetings**: Data is already fresh from morning sync

### Manual Only Approach
- **Before important meetings**: 30 minutes prior
- **Weekly management updates**: Monday morning or Friday afternoon
- **Monthly reports**: First Monday of each month
- **After major deployments**: Within 1-2 hours of production changes

## Troubleshooting

### Automation Issues

**Problem**: "Morning updates not running"
**Solution**:
```bash
# Check if cron job exists
crontab -l | grep dashboard

# Check update logs
tail -f ~/dashboard-update.log

# Test auto mode manually
./update-dashboard-data.sh --auto
```

**Problem**: "Auto mode failing"
**Solution**:
```bash
# Check error logs
grep ERROR ~/dashboard-update.log

# Verify API server can start
node bug-api-server.js

# Test API endpoint
curl -X POST http://localhost:3002/api/sync
```

**Problem**: "Cron job permission errors"
**Solution**:
```bash
# Ensure scripts are executable
chmod +x update-dashboard-data.sh
chmod +x setup-morning-cron.sh

# Check cron job path is correct
crontab -l
```

### General Issues

**Problem**: "API server not responding"
**Solution**: 
```bash
# Kill existing server and restart
lsof -ti:3002 | xargs kill -9
node bug-api-server.js
```

**Problem**: "No data changes after sync"
**Solution**: Check JIRA credentials in `.env` file

**Problem**: "GitHub Pages not updating"  
**Solution**: 
- Verify git push completed successfully
- Wait 2-3 minutes for deployment
- Hard refresh browser (Cmd+Shift+R / Ctrl+F5)

**Problem**: "Dashboard shows old data"
**Solution**: Clear browser cache or use incognito mode

### Verification Steps

After each update, verify:
1. ✅ **Data Freshness**: Check "Last Updated" timestamp in dashboard
2. ✅ **KPI Accuracy**: Verify KPIs match your expectations  
3. ✅ **Feature Functionality**: Test chart filtering and table sorting
4. ✅ **Manager Access**: Confirm production URL works for team members

## File Structure

```
/testcourse/
├── dashboard-automated-fixed.html     # Main dashboard (local + production)
├── dashboard-data.json               # Real JIRA data (updated by sync)
├── bug-api-server.js                # Local API server
├── update-dashboard-data.sh          # Automated update script
├── .env                             # Local JIRA credentials
└── DASHBOARD_UPDATE_GUIDE.md        # This documentation
```

## Manager Access Information

**For sharing with managers:**

- **Dashboard URL**: https://guylevinbob.github.io/quality-dashboard/
- **Features Available**: 
  - Interactive chart filtering (click bars to filter)
  - Table sorting (click column headers)
  - KPI monitoring and trend analysis
  - Real JIRA bug data
- **Update Schedule**: [Specify your chosen frequency]
- **Support Contact**: [Your contact information]

## Security Notes

- ✅ **Local credentials**: Stay in your `.env` file only
- ✅ **Production safety**: No JIRA credentials deployed to GitHub
- ✅ **Data privacy**: Only bug metadata shared (no sensitive details)
- ✅ **Access control**: GitHub Pages publicly accessible (adjust if needed)

## Next Steps

1. **Test the process** using the update script
2. **Establish update schedule** based on your team's needs  
3. **Communicate dashboard URL** to relevant managers
4. **Monitor usage** and gather feedback for improvements

---

*Last updated: $(date)*
*For technical support or improvements, contact: [Your email]*