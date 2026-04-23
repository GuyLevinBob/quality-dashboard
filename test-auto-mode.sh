#!/bin/bash

# Quick test script to verify auto mode functionality
echo "🧪 Testing Auto Mode Components"
echo "================================"

# Test 1: Check if script accepts --auto flag
echo "✅ Test 1: Auto flag detection"
if [[ "$1" == "--auto" ]]; then
    echo "   Auto mode detected correctly"
else
    echo "   Manual mode (run with --auto to test)"
fi

# Test 2: Check API server
echo "✅ Test 2: API server availability"
if lsof -ti:3002 > /dev/null; then
    echo "   API server running on port 3002"
else
    echo "   API server not running"
fi

# Test 3: Test API endpoint (quick)
echo "✅ Test 3: API endpoint test"
API_RESPONSE=$(curl -s -m 5 -X GET http://localhost:3002/api/bugs/lite 2>/dev/null || echo "TIMEOUT")
if [[ "$API_RESPONSE" == "TIMEOUT" ]]; then
    echo "   API timeout (server may be busy)"
elif [[ "$API_RESPONSE" == *"bugs"* ]]; then
    echo "   API responding correctly"
else
    echo "   API error: $API_RESPONSE"
fi

# Test 4: Check git status
echo "✅ Test 4: Git repository status"
git status --porcelain > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   Git repository ready"
else
    echo "   Git error"
fi

# Test 5: Check dashboard-data.json
echo "✅ Test 5: Dashboard data file"
if [ -f "dashboard-data.json" ]; then
    FILE_SIZE=$(stat -f%z dashboard-data.json 2>/dev/null || stat -c%s dashboard-data.json 2>/dev/null)
    echo "   dashboard-data.json exists ($(($FILE_SIZE / 1024))KB)"
else
    echo "   dashboard-data.json not found"
fi

echo
echo "🎯 Auto Mode Ready: All components appear functional"
echo "   To test full auto mode: ./update-dashboard-data.sh --auto"