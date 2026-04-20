#!/bin/bash

# Google Drive Upload Script for Dashboard Data
# This script helps automate uploading dashboard-safe-data.json to Google Drive

FOLDER_ID="1bPGweKsYMGkMdUOIHEGnodCqn9-Cf_2b"
FILE_NAME="dashboard-safe-data.json"

echo "📊 Google Drive Upload Helper"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if file exists
if [ ! -f "$FILE_NAME" ]; then
    echo "❌ File $FILE_NAME not found!"
    echo "💡 Run: npm run export-safe"
    exit 1
fi

echo "✅ File found: $FILE_NAME"
echo "📏 File size: $(ls -lh $FILE_NAME | awk '{print $5}')"
echo ""

echo "🔗 Your Google Drive folder:"
echo "   https://drive.google.com/drive/folders/$FOLDER_ID"
echo ""

echo "📋 Manual Upload Steps:"
echo "1. Open the Google Drive folder above"
echo "2. Click '+ New' → 'File upload'"
echo "3. Select: $FILE_NAME"
echo "4. After upload, right-click file → 'Share'"
echo "5. Change to 'Anyone with the link' → 'Viewer'"
echo "6. Copy the share link"
echo ""

echo "🔄 Convert share link to direct download:"
echo "   From: https://drive.google.com/file/d/FILE_ID/view"
echo "   To:   https://drive.google.com/uc?id=FILE_ID&export=download"
echo ""

echo "🎯 Next step: Configure your dashboard with the direct download URL"
echo ""

# Offer to open the folder
read -p "🌐 Open Google Drive folder in browser? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    open "https://drive.google.com/drive/folders/$FOLDER_ID"
    echo "✅ Opened Google Drive folder in browser"
fi

echo ""
echo "📈 After upload, test your dashboard at:"
echo "   https://guylevinbob.github.io/quality-dashboard/dashboard-external-data.html"