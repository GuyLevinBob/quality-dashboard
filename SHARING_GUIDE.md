# 📊 HiBob Bug Dashboard - Team Sharing Guide

## 🚀 Quick Start Options (Choose One)

### Option 1: Instant Local Sharing (5 minutes)
**Best for: Immediate demo or small team access**

```bash
# Start the local server
node share-dashboard-locally.js

# Share the network URL with your team
# Example: http://192.168.1.100:3000/dashboard
```

**Pros:** ✅ Instant setup ✅ No external dependencies  
**Cons:** ❌ Only works while your computer is on ❌ Local network only

---

### Option 2: GitHub Pages (15 minutes setup)
**Best for: Professional sharing across organization**

1. **Setup Repository:**
   ```bash
   git init
   git add .
   git commit -m "Initial dashboard"
   # Create repo on GitHub, then push
   ```

2. **Enable GitHub Pages:**
   - Go to repo Settings → Pages
   - Source: "main branch"
   - Save

3. **Access:** `https://YOUR-USERNAME.github.io/REPO-NAME/bug-dashboard-embedded.html`

**Pros:** ✅ Professional URL ✅ Always available ✅ Version control ✅ Free  
**Cons:** ❌ Requires GitHub account ❌ Manual data updates

---

### Option 3: Automated GitHub Pages (30 minutes setup)
**Best for: Always up-to-date dashboard**

1. **Follow Option 2 steps**

2. **Add GitHub Secrets:**
   - Go to repo Settings → Secrets
   - Add: `JIRA_DOMAIN`, `JIRA_EMAIL`, `JIRA_API_TOKEN`

3. **GitHub Action will auto-update daily**

**Pros:** ✅ Automatic data updates ✅ Always current ✅ Professional  
**Cons:** ❌ More complex setup ❌ Requires JIRA credentials in GitHub

---

## 🏢 Enterprise Options

### SharePoint Integration
```html
<!-- Embed in SharePoint page -->
<iframe src="PATH_TO_DASHBOARD.html" width="100%" height="800px"></iframe>
```

### Confluence Integration
1. Create page → Insert → Other macros → HTML
2. Paste dashboard HTML content
3. Set page permissions for teams

### Slack Integration
- Pin dashboard URL in team channels
- Create Slack workflow to share weekly
- Bot notifications for critical bugs

---

## 📱 Access Control & Permissions

### Public Dashboard (GitHub Pages)
- ✅ Easy to share
- ❌ Anyone with link can access
- ❌ JIRA data potentially exposed

### Private Repository
- ✅ Access control via GitHub teams
- ✅ Private JIRA data
- ❌ Requires GitHub accounts for viewers

### Company Internal Hosting
- ✅ Full access control
- ✅ Company security policies
- ❌ Requires IT infrastructure

---

## 🔄 Data Freshness Options

### Manual Updates
```bash
npm run refresh  # Export new data and update dashboard
```

### Scheduled Updates (Recommended)
- Daily automatic refresh
- Weekend maintenance window
- Alert on data export failures

### Real-time Integration
- Direct JIRA API calls from browser
- Live filtering and updates
- Requires authentication handling

---

## 📊 Usage Analytics & Monitoring

### Track Dashboard Usage
- Google Analytics integration
- View count tracking
- User feedback collection

### Monitor Data Quality
- Alert on missing JIRA fields
- Data validation checks
- Export success notifications

---

## 🎯 Recommended Approach

**For Most Teams:** Start with **Option 2 (GitHub Pages)** 

1. Quick professional setup
2. Easy to share URL
3. Version controlled
4. Can upgrade to automated later

**Command to get started:**
```bash
# Make sure you have the latest data
npm run refresh

# Then follow GitHub Pages setup guide
```

---

## 📞 Support & Maintenance

### Regular Maintenance Tasks
- [ ] Weekly data refresh (if not automated)
- [ ] Monitor dashboard performance
- [ ] Update JIRA field mappings if changed
- [ ] Collect team feedback for improvements

### Troubleshooting
- **Filters empty?** → Re-run `npm run refresh`
- **Old data showing?** → Check GitHub Actions logs
- **Access issues?** → Verify repository permissions
- **Performance slow?** → Consider data pagination

### Enhancement Requests
- Additional filters
- Export capabilities  
- Mobile optimization
- Team-specific views
- Integration with other tools