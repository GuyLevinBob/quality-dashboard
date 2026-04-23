# HiBob Production Bug Analytics Dashboard

A comprehensive bug tracking and analytics dashboard for production issue management, featuring real-time JIRA integration and advanced data visualization.

## Features

- 📊 **Real-time JIRA Integration**: Live sync with JIRA API for up-to-date bug data
- 🎯 **Interactive Analytics**: Drag-and-drop chart builder with filtering capabilities  
- 📈 **KPI Monitoring**: Key metrics including regression rate, SLA compliance, and bug velocity
- 🔍 **Advanced Filtering**: Multi-dimensional filtering with chart-based interactions
- 📱 **Responsive Design**: Works across desktop and mobile devices
- 💾 **Chart Management**: Save and load custom chart configurations
- 🕘 **Morning Automation**: Automatic daily updates for GitHub Pages deployment

## ⚡ Morning Automation (NEW!)

Set up automatic daily updates in 2 minutes:

```bash
./setup-morning-cron.sh
```

**Benefits:**
- ✅ Fresh JIRA data every morning (9 AM, weekdays)
- ✅ Managers always see current bug status
- ✅ Zero manual work required
- ✅ GitHub Pages automatically updated

👉 **[Full Setup Guide](AUTOMATION_SETUP.md)**

## Quick Start

### Local Development (Full Features)

1. **Start the API server**:
```bash
node bug-api-server.js
```

2. **Start the web server**:
```bash
python3 -m http.server 8090
```

3. **Access dashboard**:
```
http://127.0.0.1:8090/dashboard-automated-fixed.html
```

### Static Deployment (Cross-Team Access)

For managers and cross-team access without local setup:

1. **Update data** (when needed):
```bash
./update-dashboard-data.sh
```

2. **Access production dashboard**:
```
https://guylevinbob.github.io/quality-dashboard/
```

## Project Structure

```
├── dashboard-automated-fixed.html    # Main dashboard application
├── bug-api-server.js                # Node.js API server for JIRA integration
├── dashboard-data.json              # Cached JIRA data (real bug data)
├── update-dashboard-data.sh         # Automated update script
├── DASHBOARD_UPDATE_GUIDE.md        # Comprehensive update documentation
├── DASHBOARD_CAPABILITIES.md        # Technical feature documentation
└── .env                            # JIRA credentials (local only)
```

## Configuration

### Environment Variables (.env)
```env
JIRA_USERNAME=your-username
JIRA_API_TOKEN=your-api-token
JIRA_DOMAIN=hibob.atlassian.net
```

### API Server (bug-api-server.js)
- **Port**: 3002
- **Endpoints**: `/api/sync`, `/api/bugs-lite`
- **Features**: JIRA changelog parsing, resolution date extraction

### Web Server
- **Port**: 8090 (configurable)
- **Purpose**: Serves static dashboard files

## Deployment Options

### Option 1: Local Development (Recommended for Daily Use)
- **Pros**: Live JIRA sync, real-time data, full functionality
- **Cons**: Requires local setup, not accessible to others
- **Use case**: Development, analysis, troubleshooting

### Option 2: Static GitHub Pages (Recommended for Management)  
- **Pros**: Professional URL, no local setup, cross-team access
- **Cons**: Manual updates required, no live sync
- **Use case**: Management reviews, stakeholder demos

## Documentation

- **[AUTOMATION_SETUP.md](AUTOMATION_SETUP.md)** - ⚡ Morning automation setup (NEW!)
- **[DASHBOARD_CAPABILITIES.md](DASHBOARD_CAPABILITIES.md)** - Complete feature documentation  
- **[DASHBOARD_UPDATE_GUIDE.md](DASHBOARD_UPDATE_GUIDE.md)** - Manual & automated update guide
- **[JIRA_INTEGRATION_README.md](JIRA_INTEGRATION_README.md)** - API integration details

## Usage Examples

### Interactive Chart Building
1. Drag fields to X-axis (Status, Sprint, System, etc.)
2. Drag metrics to Y-axis (Bug Count, Days to Fix, etc.)  
3. Optional: Add grouping field for multi-dimensional analysis
4. Click chart elements to filter the main data table

### KPI Monitoring
- **Regression Rate**: Percentage of bugs marked as regressions
- **SLA Compliance**: Percentage of critical/high bugs resolved within SLA
- **Bug Velocity**: Average bugs resolved per month
- **Median Resolution**: Typical time to resolve production issues

### Advanced Filtering
- Multi-select dropdowns for categorical filtering
- Date range filtering for temporal analysis
- Search functionality across bug summaries
- Chart-based filtering (click bars/slices to filter table)

## Development

### Adding New Features
1. Edit `dashboard-automated-fixed.html`
2. Test locally with both servers running
3. Update documentation as needed
4. For cross-team deployment, run update script

### Modifying JIRA Integration
1. Edit `bug-api-server.js` 
2. Update field mappings or API calls
3. Test with local dashboard
4. Sync new data format using dashboard

## Troubleshooting

### Common Issues
- **API Connection**: Check `.env` credentials and JIRA permissions
- **Port Conflicts**: Ensure ports 3002 and 8090 are available  
- **Data Loading**: Verify `dashboard-data.json` exists and is valid JSON
- **GitHub Pages**: Allow 1-2 minutes for deployment after git push

### Debug Mode
Enable detailed logging by opening browser console while using dashboard.

## License

Internal company project for HiBob production bug analytics.

## Support

For technical issues or feature requests, contact the development team.
