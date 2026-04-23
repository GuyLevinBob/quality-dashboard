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

## Manual Update Process

### Quick Method (Automated Script)

```bash
# Run the automated update script
./update-dashboard-data.sh
```

The script will:
1. ✅ Start the local API server (if needed)
2. ✅ Guide you through the sync process
3. ✅ Help deploy updated data to GitHub Pages
4. ✅ Provide confirmation and next steps

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

## Update Frequency Recommendations

### Before Important Meetings
- **When**: 30 minutes before executive reviews
- **Purpose**: Ensure managers have latest bug status
- **Focus**: Check critical bug resolution progress

### Weekly Management Updates  
- **When**: Monday morning or Friday afternoon
- **Purpose**: Regular team performance reviews
- **Focus**: Weekly trend analysis and KPI updates

### Monthly Comprehensive Reports
- **When**: First Monday of each month  
- **Purpose**: Monthly quality reports and planning
- **Focus**: Complete data refresh for strategic discussions

### Ad-hoc Updates
- **When**: After major deployments or incidents
- **Purpose**: Immediate visibility into production health
- **Focus**: Recent bug creation and resolution activity

## Troubleshooting

### Common Issues

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