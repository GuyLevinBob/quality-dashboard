# 🔒 Local Automation Setup (Secure JIRA Dashboard Updates)

**Your automated dashboard solution that keeps JIRA credentials safe on your computer!**

---

## 🎯 **The Problem We Solved**

- ❌ **GitHub Secrets approach:** Atlassian automatically revokes tokens used in automation
- ❌ **Manual copy-paste:** Defeats the purpose of automation  
- ❌ **Google Drive issues:** CORS problems and complexity

## ✅ **Our Solution: Local Automation**

**✅ JIRA credentials stay on your computer (never uploaded anywhere)**  
**✅ Automated daily updates for your team**  
**✅ Professional dashboard URL**  
**✅ Zero CORS issues (same-domain loading)**

---

## 🚀 **How It Works**

```
Your Computer (Local):
1. Export JIRA data using local .env file ✅ Secure
2. Create anonymized version ✅ Safe for sharing  
3. Update dashboard-data.json ✅ Only safe data
4. Push to GitHub ✅ No credentials exposed

GitHub Pages:
5. Automatically serves updated dashboard ✅ Team access
6. Dashboard loads from same domain ✅ No CORS issues
```

---

## 📋 **Setup Instructions (One-time)**

### **Step 1: Verify Your Setup**
```bash
# Check that your local JIRA credentials work
node export-jira-data.js

# Should export 971+ bugs successfully
```

### **Step 2: Test the Local Automation**
```bash
# Run the full update process
npm run daily-update

# This will:
# ✅ Export fresh JIRA data
# ✅ Create safe version  
# ✅ Update dashboard file
# ✅ Push to GitHub
# ✅ Your team sees updated dashboard
```

### **Step 3: Share with Your Team**
**Team Dashboard URL:** https://guylevinbob.github.io/quality-dashboard/dashboard-automated.html

---

## ⏰ **Automation Options**

### **Option 1: Manual (Weekly/Monthly)**
```bash
# When you want to refresh the dashboard
npm run daily-update
```

### **Option 2: Daily Automation (Recommended)**

**macOS/Linux (Cron):**
```bash
# Edit cron schedule
crontab -e

# Add this line for daily updates at 8 AM
0 8 * * * cd /path/to/your/project && npm run daily-update
```

**Windows (Task Scheduler):**
1. Open Task Scheduler
2. Create Basic Task → Daily → 8:00 AM
3. Action: Start a program
4. Program: `node`
5. Arguments: `daily-auto-update.js`
6. Start in: `C:\path\to\your\project`

### **Option 3: System Service**
```bash
# Run continuously with smart scheduling
node daily-scheduler.js start
```

---

## 🔒 **Security Features**

### **✅ What Stays Local (Secure)**
- Your JIRA domain, email, and API token (.env file)
- Raw JIRA bug data with sensitive descriptions  
- Full bug details with assignee emails

### **✅ What Gets Shared (Safe)**
- Anonymized bug analytics (counts, teams, systems)
- No personal emails or sensitive bug descriptions
- Only aggregate statistics and trends

### **✅ Example of Safe Data**
```json
{
  "key": "BT-13289",
  "status": "Not Started", 
  "leadingTeam": "MIS - GTM",
  "system": "RingLead",
  "severity": "Low"
  // ❌ No emails, detailed descriptions, or sensitive info
}
```

---

## 📊 **What Your Team Gets**

**Professional Dashboard Features:**
- ✅ **971+ bugs tracked** with full analytics
- ✅ **Real-time stats** (total bugs, deployed, high priority)
- ✅ **Team breakdowns** (leading teams, systems affected)
- ✅ **Charts and trends** (status distribution, priority levels)
- ✅ **Auto-refresh** (dashboard updates when you push new data)
- ✅ **Mobile responsive** (works on all devices)

**Team Access:**
- 📱 **Bookmark the URL** - always up to date
- 👥 **Share with anyone** - no login required
- 📈 **Fresh data** whenever you run the update
- 🔒 **Secure** - no sensitive information exposed

---

## 🛠 **Troubleshooting**

### **"Failed to export JIRA data"**
- Check your `.env` file has correct credentials
- Verify network connection to JIRA
- Make sure API token is valid (not revoked)

### **"Git push failed"**  
- Ensure you have push access to the repository
- Check if you're logged into Git (`git config user.email`)
- Verify GitHub credentials are working

### **"Dashboard not updating"**
- Wait 2-3 minutes for GitHub Pages to deploy
- Check if `dashboard-data.json` was updated in repository
- Clear browser cache and refresh dashboard

---

## 🎯 **Daily Workflow (Automated)**

**Your Daily Routine:**
1. ☕ **Drink coffee** (the automation handles everything else)

**What Happens Automatically:**
1. 🤖 **8 AM:** Automation runs on your computer
2. 📊 **Export:** Fresh JIRA data pulled securely  
3. 🔒 **Sanitize:** Safe version created for sharing
4. 📤 **Push:** Updated data uploaded to GitHub
5. 🌐 **Deploy:** Team dashboard refreshes automatically
6. 👥 **Team Access:** Everyone sees latest production bug analytics

---

## ✅ **Success Checklist**

**After setup, you should have:**
- [ ] Dashboard shows 971+ bugs with full analytics
- [ ] Team can access: https://guylevinbob.github.io/quality-dashboard/dashboard-automated.html
- [ ] `npm run daily-update` completes successfully  
- [ ] Dashboard refreshes when you push updates
- [ ] Your JIRA credentials never leave your computer
- [ ] Team gets automated daily updates (when scheduled)

---

## 🎉 **Benefits Summary**

**For You (Security & Automation):**
- 🔒 **JIRA credentials stay local** (never exposed)
- 🤖 **Automation works** (no manual steps)  
- ⚡ **Fast and reliable** (same-domain loading)
- 🛡️ **Atlassian won't revoke** your token (local use only)

**For Your Team (Professional Dashboard):**
- 📊 **Always current data** (when you update)
- 🌐 **Professional URL** (easy to bookmark and share)
- 📱 **Works everywhere** (mobile, desktop, all browsers)
- 🚀 **Fast loading** (no CORS issues or external dependencies)

**Perfect balance of security, automation, and team collaboration!** 🎯