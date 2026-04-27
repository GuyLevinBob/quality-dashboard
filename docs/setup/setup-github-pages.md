# Quick Setup: GitHub Pages Dashboard Sharing

## Step 1: Create GitHub Repository
```bash
# In your project directory
git init
git add .
git commit -m "Initial dashboard setup"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR-USERNAME/bug-dashboard.git
git branch -M main
git push -u origin main
```

## Step 2: Enable GitHub Pages
1. Go to repository Settings → Pages
2. Source: "Deploy from a branch"
3. Branch: "main"
4. Folder: "/ (root)"
5. Save

## Step 3: Access Your Dashboard
Your dashboard will be available at:
`https://YOUR-USERNAME.github.io/quality-dashboard/` (uses index.html)

Or directly:
`https://YOUR-USERNAME.github.io/quality-dashboard/dashboard-automated-fixed.html`

## Step 4: Share with Teams
- Share the GitHub Pages URL
- Bookmark in team browsers
- Add to team documentation
- Include in regular team communications

## Benefits
✅ Professional URL  
✅ Always latest version  
✅ Version control history  
✅ Free hosting  
✅ Easy updates via git  
✅ Access controls via GitHub