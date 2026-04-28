/**
 * ADD THIS TO YOUR EXISTING API SERVER
 * 
 * Just add this route to your existing Express server that's already running on localhost:3002
 * This leverages your existing JIRA infrastructure and data transformation.
 */

// Add this route to your existing server file:

app.get('/api/testing-coverage', async (req, res) => {
    try {
        console.log('🎯 Testing coverage endpoint called');
        
        // Use your existing issues-lite endpoint to get all data
        const internalResponse = await fetch('http://localhost:3002/api/issues-lite?types=Story');
        
        if (!internalResponse.ok) {
            throw new Error(`Failed to get stories: ${internalResponse.status}`);
        }
        
        const data = await internalResponse.json();
        const allStories = data.issues || [];
        
        console.log(`📊 Retrieved ${allStories.length} stories from existing API`);
        
        // Apply testing coverage filtering (your exact JQL requirements)
        const filteredStories = allStories.filter(story => {
            const storyPoints = parseFloat(story.storyPoints) || 0;
            const isEligiblePoints = storyPoints >= 0.5;
            const isValidStatus = !['Canceled', 'Cancelled', 'Reject', 'Rejected'].includes(story.status);
            const isValidTeam = ['MIS - GTM', 'MIS - GTC', 'MIS - CORP', 'MIS - Platform'].includes(story.leadingTeam);
            
            return isEligiblePoints && isValidStatus && isValidTeam;
        });
        
        console.log(`📊 Filtered to ${filteredStories.length} eligible stories`);
        
        // Team breakdown
        const teamBreakdown = {};
        filteredStories.forEach(story => {
            const team = story.leadingTeam || 'No Team';
            teamBreakdown[team] = (teamBreakdown[team] || 0) + 1;
        });
        
        console.log('📊 Team breakdown:', teamBreakdown);
        
        // TestCase breakdown  
        const testCaseBreakdown = {};
        filteredStories.forEach(story => {
            const testCase = story.testCaseCreated || 'No Value';
            testCaseBreakdown[testCase] = (testCaseBreakdown[testCase] || 0) + 1;
        });
        
        console.log('📊 TestCase breakdown:', testCaseBreakdown);
        
        // Return the filtered data
        res.json({
            stories: filteredStories,
            total: filteredStories.length,
            metadata: {
                query: 'Testing Coverage Analytics',
                criteria: 'Stories ≥0.5 points, valid teams (MIS - GTM/GTC/CORP/Platform), not cancelled/rejected',
                timestamp: new Date().toISOString(),
                teams: ['MIS - GTM', 'MIS - GTC', 'MIS - CORP', 'MIS - Platform'],
                teamBreakdown: teamBreakdown,
                testCaseBreakdown: testCaseBreakdown,
                source: 'existing-api-filtered'
            }
        });
        
    } catch (error) {
        console.error('❌ Testing coverage endpoint error:', error);
        res.status(500).json({
            error: 'Failed to fetch testing coverage data',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * THAT'S IT! Just add this one route to your existing server.
 * 
 * Your dashboard is already configured to call this endpoint and will 
 * automatically use the filtered data instead of the limited 34 stories.
 * 
 * Expected result: ~594 stories instead of 34!
 */