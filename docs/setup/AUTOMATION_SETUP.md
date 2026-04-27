# 🕘 Dashboard Morning Automation Setup

Get fresh JIRA data in your dashboard every morning automatically!

## ⚡ Quick Setup (2 minutes)

1. **One-time setup for morning automation:**
   ```bash
   ./setup-morning-cron.sh
   ```

2. **That's it!** Your dashboard will now update automatically every weekday at 9 AM.

## 🎯 What You Get

**Before Automation:**
- Remember to update dashboard manually
- Risk of stale data for management reviews
- 3-5 minutes of manual work each time

**After Automation:** 
- ✅ Fresh data every morning automatically
- ✅ Managers always see current bug status
- ✅ Zero manual work required
- ✅ Update logs for tracking

## 📋 Available Commands

### Setup & Management
```bash
./setup-morning-cron.sh          # Set up morning automation
crontab -l                       # View scheduled jobs  
tail -f ~/dashboard-update.log   # Monitor updates live
```

### Manual Updates (when needed)
```bash
./update-dashboard-data.sh       # Interactive mode (existing behavior)
./update-dashboard-data.sh --auto   # Auto mode (no prompts)
```

### Testing & Troubleshooting
```bash
./test-auto-mode.sh --auto       # Test all components
node bug-api-server.js           # Start API server manually
curl -X POST http://localhost:3002/api/sync  # Test sync API
```

## 🔧 How It Works

### Morning Automation Flow
```
9:00 AM (Mon-Fri) → Cron Job Triggers → Auto Script Runs → 
JIRA Sync → Update dashboard-data.json → Git Push → 
GitHub Pages Updated → Log Results
```

### Security & Privacy
- ✅ JIRA credentials stay in your local `.env` file only
- ✅ No cloud processing or external storage
- ✅ Same security model as manual updates
- ✅ All automation runs on your local machine

## 📊 Monitoring & Logs

**Check if morning updates are working:**
```bash
# View today's updates
grep "$(date +%Y-%m-%d)" ~/dashboard-update.log

# View recent logs
tail -20 ~/dashboard-update.log

# Watch live updates
tail -f ~/dashboard-update.log
```

**Example log output:**
```
2026-04-23 09:00:02: Starting automated dashboard update
2026-04-23 09:00:15: Sync completed successfully  
2026-04-23 09:00:18: Dashboard auto-update completed at Wed Apr 23 09:00:18 PDT 2026
```

## ⚠️ Important Notes

**Requirements:**
- Keep your computer running during morning hours (or updates won't run)
- Ensure stable internet connection for JIRA access
- Make sure API server can start (no port 3002 conflicts)

**Disable if needed:**
```bash
# Temporarily disable morning updates
crontab -e
# Add # at the beginning of the dashboard line

# Permanently remove  
crontab -l | grep -v "update-dashboard-data.sh" | crontab -
```

## 🎉 Benefits Summary

**For You:**
- 🕘 No more manual morning updates
- 📈 Consistent data freshness
- 📝 Automatic logging and tracking
- 🔄 Manual override still available

**For Managers:**
- 📊 Always see current bug metrics
- 📅 Reliable daily data updates
- 🎯 Trust in dashboard accuracy
- ⚡ No delays waiting for manual updates

## 🆘 Troubleshooting

**Updates not running?**
- Check cron job: `crontab -l`
- Check logs: `tail ~/dashboard-update.log`
- Test manually: `./update-dashboard-data.sh --auto`

**Sync failures?**  
- Verify JIRA credentials in `.env`
- Check API server: `curl http://localhost:3002/api/sync`
- Look for errors in logs

**Git push failures?**
- Check network connection
- Verify GitHub credentials
- Run manual test: `git push`

---

🚀 **Ready to go!** Run `./setup-morning-cron.sh` and enjoy automatic morning dashboard updates!