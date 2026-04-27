# 🐛 Jira Bug Dashboard

A comprehensive HTML dashboard for visualizing and analyzing your Jira production bugs.

## 🚀 Quick Start

1. **Open the dashboard:**
   ```bash
   open bug-dashboard.html
   ```
   Or simply double-click `bug-dashboard.html` in Finder

2. **The dashboard will show:**
   - 📊 Real-time bug statistics
   - 📈 Interactive charts and visualizations  
   - 🔍 Searchable and filterable bug list
   - 📋 Detailed bug information

## 📊 Dashboard Features

### Overview Statistics
- **Total Bugs**: Current count of all bugs
- **High Priority**: Critical bugs needing immediate attention
- **Deployed**: Successfully fixed and deployed bugs
- **Average Days Open**: Mean resolution time

### Interactive Charts
- **Status Distribution**: Pie chart showing bug status breakdown
- **Priority Distribution**: Bar chart of priority levels
- **Days Open Distribution**: Timeline analysis of bug age
- **Top Assignees**: Who has the most assigned bugs

### Advanced Filtering
- Filter by Status (Not Started, Deployed, etc.)
- Filter by Priority (High, Medium, Low)  
- Filter by Assignee
- Search by bug key or summary

### Detailed Bug Table
- Complete bug information
- Sortable and filterable
- Status and priority badges
- Days open tracking

## 🔄 Updating Data

To refresh the dashboard with latest bug data:

```bash
# Export fresh data from Jira
node export-jira-data.js

# Dashboard will automatically show updated data when refreshed
```

## 📁 Files Created

- `bug-dashboard.html` - Main dashboard file
- `jira-bugs-data.json` - Bug data (auto-generated)
- `export-jira-data.js` - Data export script
- `jira-bugs.js` - Core Jira API client

## 🎨 Dashboard Highlights

- **Responsive Design**: Works on desktop, tablet, and mobile
- **Modern UI**: Clean, professional interface with smooth animations
- **Real-time Filtering**: Instant search and filter results
- **Visual Analytics**: Interactive charts powered by Chart.js
- **Data Export**: All data available in JSON format

## 💡 Next Steps

- Set up automated data refresh (cron job)
- Add email alerts for high-priority bugs
- Create project-specific dashboards
- Add time-based trending analysis

## 🔧 Troubleshooting

If the dashboard shows "Error loading bug data":
1. Ensure `jira-bugs-data.json` exists in the same directory
2. Run `node export-jira-data.js` to regenerate data
3. Check that your `.env` file has valid Jira credentials