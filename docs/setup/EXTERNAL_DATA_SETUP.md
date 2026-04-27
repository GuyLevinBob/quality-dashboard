# 🔒 Secure Dashboard Updates (No Git Secrets)

**Your dashboard is live at:** https://guylevinbob.github.io/quality-dashboard/bug-dashboard-embedded.html

This guide shows you how to set up **daily data updates without storing credentials in Git**.

---

## 🎯 **Solution Overview**

**Problem:** Atlassian revoked your API token because they detected automation  
**Solution:** Separate data hosting + local automation (no secrets in Git)

**Architecture:**
```
Your Computer (with .env) → Export Data → External Hosting → Dashboard Fetches Data
```

---

## 🚀 **Quick Setup (Choose Your Method)**

### **Method 1: Google Drive (Recommended)** ⭐⭐⭐

**Setup (5 minutes):**

1. **Export your data:**
   ```bash
   npm run refresh-safe  # Creates dashboard-safe-data.json
   ```

2. **Upload to Google Drive:**
   - Upload `dashboard-safe-data.json` to Google Drive
   - **Right-click → Share → Anyone with link can view**
   - **Get shareable link** (looks like: `https://drive.google.com/file/d/ABC123/view`)

3. **Convert to direct download URL:**
   ```
   Original: https://drive.google.com/file/d/ABC123/view
   Direct:   https://drive.google.com/uc?id=ABC123&export=download
   ```

4. **Configure your dashboard:**
   - Go to: https://guylevinbob.github.io/quality-dashboard/dashboard-external-data.html
   - Paste the direct download URL
   - Click "Load Data"

**Daily Updates:**
```bash
# Run this daily (manually or via scheduler)
npm run refresh-safe
# Upload new dashboard-safe-data.json to Google Drive (overwrites old)
```

---

### **Method 2: Company SharePoint/File Server** ⭐⭐

**Setup:**

1. **Export safe data:**
   ```bash
   npm run export-safe
   ```

2. **Upload to company location:**
   - SharePoint document library
   - Network drive accessible via URL
   - Company file sharing service

3. **Get public/internal URL** to the JSON file

4. **Configure dashboard** with internal URL

**Benefits:** 
- ✅ Company-controlled security
- ✅ Internal network only
- ✅ Existing access controls

---

### **Method 3: Automated Local Updates** ⭐

**For hands-off daily updates:**

1. **Install as system service:**
   ```bash
   # Test once
   node daily-scheduler.js run-once
   
   # Start continuous updates
   node daily-scheduler.js start
   ```

2. **Configure upload method:**
   ```bash
   # Copy to network drive
   UPLOAD_METHOD=file NETWORK_DRIVE_PATH="/Volumes/Shared/dashboard-data.json" node daily-scheduler.js start
   
   # Or HTTP upload to company webhook
   UPLOAD_METHOD=http WEBHOOK_URL="https://company.com/api/upload" node daily-scheduler.js start
   ```

---

## 📋 **Step-by-Step Implementation**

### **Step 1: Test Your Current Setup**

```bash
# Make sure your local JIRA connection works
node export-jira-data.js

# Create sanitized version for sharing  
node export-safe-data.js

# You should now have: dashboard-safe-data.json (971 bugs, anonymized)
```

### **Step 2: Choose External Hosting**

**Option A: Google Drive (Easiest)**
- Upload JSON file to Drive
- Make publicly viewable
- Use direct download URL

**Option B: Company Infrastructure**  
- SharePoint document library
- Internal file server with HTTP access
- Company cloud storage

**Option C: Simple Web Server**
- Your own web server/hosting
- Company's static file hosting
- CDN with file upload capability

### **Step 3: Update Dashboard Configuration**

**Option 1: Modify Existing Dashboard**
```javascript
// Add to your existing dashboard
const EXTERNAL_DATA_URL = 'https://drive.google.com/uc?id=YOUR_FILE_ID&export=download';

async function loadExternalData() {
    try {
        const response = await fetch(EXTERNAL_DATA_URL);
        const data = await response.json();
        // Use data instead of embedded data
        bugsData = data.bugs;
        populateFilters();
        displayBugsTable();
    } catch (error) {
        console.error('Failed to load external data:', error);
        // Fallback to embedded data
    }
}
```

**Option 2: Use New External Data Dashboard**
- Deploy `dashboard-external-data.html` to GitHub Pages
- Configure data URL in the interface
- Share new URL with teams

### **Step 4: Automate Updates** 

**Manual (Weekly/Monthly):**
```bash
# When you want fresh data
npm run refresh-safe
# Upload dashboard-safe-data.json to your hosting location
```

**Automated (Daily):**
```bash
# Set up local scheduler
node daily-scheduler.js start

# Or use system scheduler (cron on macOS/Linux)
echo "0 8 * * * cd /path/to/project && npm run refresh-safe && /path/to/upload-script.sh" | crontab -
```

---

## 🔒 **Security Benefits**

**✅ What's Secure:**
- **Credentials stay local** (in your .env file only)
- **Anonymized data** for sharing (no sensitive bug details) 
- **No secrets in Git** (ever!)
- **Company-controlled hosting** (if using internal servers)

**✅ What Gets Shared:**
- Bug counts and analytics only
- Team names and system names
- Status and priority data  
- **No personal emails, sensitive descriptions, or credentials**

---

## 📊 **Data File Structure** 

**What's in `dashboard-safe-data.json`:**
```json
{
  "metadata": {
    "exported": "2026-04-20T...",
    "totalBugs": 971,
    "dataType": "sanitized"
  },
  "bugs": [
    {
      "key": "BT-13289", 
      "summary": "Production - Contact merge issue", // Anonymized
      "status": "Not Started",
      "severity": "Low", 
      "leadingTeam": "MIS - GTM",
      "system": "RingLead"
      // No emails, no detailed descriptions, no sensitive data
    }
  ]
}
```

---

## 🎯 **Recommended Next Steps**

**For Most Teams:**

1. **Start with Google Drive** (easiest setup)
2. **Test manual updates** weekly for a few weeks  
3. **Add automation** once comfortable with the process
4. **Share dashboard URL** with your teams

**Commands to run now:**
```bash
# Create your first safe export
npm run export-safe

# Test the scheduler once
node daily-scheduler.js run-once

# Check what files you have
ls -la dashboard-*.json dashboard-*.html
```

---

## 🆘 **Troubleshooting**

**Dashboard shows "Loading..."**
- Check if external data URL is accessible
- Verify JSON file format is correct
- Check browser console for errors

**Scheduler fails:**  
- Verify .env file has valid JIRA credentials
- Check network connectivity to JIRA
- Review scheduler.log for details

**Upload fails:**
- Check file permissions on target location
- Verify network drive/URL accessibility
- Test manual file copy first

---

**🎉 Ready to get started? Run `npm run export-safe` and choose your hosting method!**