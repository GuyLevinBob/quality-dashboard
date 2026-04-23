// JIRA Custom Field Mappings for HiBob Dashboard
// This file contains the correct field IDs for extracting data from JIRA API

const JIRA_FIELD_MAPPINGS = {
    // Core JIRA fields
    SPRINT: 'customfield_10020',           // Sprint field (array of sprint objects)
    
    // Custom fields specific to HiBob JIRA instance
    LEADING_TEAM: 'customfield_10574',     // Leading Team dropdown (e.g., "MIS - CORP")
    SYSTEM: 'customfield_10107',           // System dropdown (e.g., "CaptivateIQ")
    REGRESSION: 'customfield_10106',       // Regression flag (Yes/No)
    SEVERITY: 'customfield_10104',         // Severity dropdown (e.g., "High", "Critical")
    BUG_TYPE: 'customfield_10578',         // Bug Type dropdown (e.g., "Production")
    
    // Story-specific fields
    STORY_POINTS: 'customfield_10016',     // Story Points field (Fibonacci points)
    EPIC_LINK: 'customfield_10014',        // Epic Link field  
    TEST_CASE_CREATED: 'customfield_XXXX', // Test Case Created field (Yes/No) - NEEDS REAL FIELD ID
    
    // Test Case-specific fields
    AI_GENERATED_TEST_CASES: 'customfield_YYYY', // AI Generated Test Cases field - NEEDS REAL FIELD ID
    TEST_TYPE: 'customfield_ZZZZ',         // Test Type field - NEEDS REAL FIELD ID
    
    // Standard JIRA fields
    ASSIGNEE: 'assignee',                  // Assignee object
    REPORTER: 'reporter',                  // Reporter object
    STATUS: 'status',                      // Status object
    PRIORITY: 'priority',                  // Priority object
    SUMMARY: 'summary',                    // Issue summary text
    DESCRIPTION: 'description',            // Issue description
    CREATED: 'created',                    // Creation date
    UPDATED: 'updated',                    // Last update date
    RESOLUTION: 'resolution',              // Resolution object
    COMPONENTS: 'components',              // Components array (usually empty in our case)
    LABELS: 'labels',                      // Labels array (usually empty in our case)
    ISSUE_TYPE: 'issuetype'                // Issue type object (Bug, Story, Test, etc.)
};

// Field extraction helpers
const FIELD_EXTRACTORS = {
    // Extract display value from custom field objects
    getCustomFieldValue: (fieldData) => {
        if (!fieldData) return null;
        
        // Handle array format (like regression field sometimes)
        if (Array.isArray(fieldData)) {
            return fieldData.length > 0 ? (fieldData[0].value || fieldData[0]) : null;
        }
        
        // Handle object format with .value property
        if (typeof fieldData === 'object' && fieldData.value) {
            return fieldData.value;
        }
        
        // Handle direct string values
        if (typeof fieldData === 'string') {
            return fieldData;
        }
        
        return null;
    },
    
    // Extract sprint name from sprint object
    getSprintName: (sprintField) => {
        if (!sprintField || !Array.isArray(sprintField) || sprintField.length === 0) {
            return null;
        }
        
        // Get the most recent sprint (last in array)
        const latestSprint = sprintField[sprintField.length - 1];
        return latestSprint.name || null;
    },
    
    // Extract user display name
    getUserDisplayName: (userField) => {
        if (!userField) return null;
        return userField.displayName || userField.name || null;
    },
    
    // Extract status name
    getStatusName: (statusField) => {
        if (!statusField) return null;
        return statusField.name || null;
    },
    
    // Extract issue type name
    getIssueTypeName: (issueTypeField) => {
        if (!issueTypeField) return null;
        return issueTypeField.name || null;
    },
    
    // Extract story points (numeric field)
    getStoryPoints: (storyPointsField) => {
        if (!storyPointsField) return 0;
        return parseFloat(storyPointsField) || 0;
    },
    
    // Extract epic link
    getEpicLink: (epicLinkField) => {
        if (!epicLinkField) return null;
        // Epic link can be a string (epic key) or object
        if (typeof epicLinkField === 'string') return epicLinkField;
        return epicLinkField.key || epicLinkField.name || null;
    }
};

// API query configuration
const JIRA_API_CONFIG = {
    // Fields to include in API requests
    REQUIRED_FIELDS: [
        JIRA_FIELD_MAPPINGS.SPRINT,
        JIRA_FIELD_MAPPINGS.LEADING_TEAM,
        JIRA_FIELD_MAPPINGS.SYSTEM,
        JIRA_FIELD_MAPPINGS.REGRESSION,
        JIRA_FIELD_MAPPINGS.SEVERITY,
        JIRA_FIELD_MAPPINGS.BUG_TYPE,
        JIRA_FIELD_MAPPINGS.ASSIGNEE,
        JIRA_FIELD_MAPPINGS.STATUS,
        JIRA_FIELD_MAPPINGS.SUMMARY,
        JIRA_FIELD_MAPPINGS.PRIORITY,
        JIRA_FIELD_MAPPINGS.CREATED,
        JIRA_FIELD_MAPPINGS.UPDATED,
        JIRA_FIELD_MAPPINGS.RESOLUTION,
        JIRA_FIELD_MAPPINGS.ISSUE_TYPE,
        // Story-specific fields
        JIRA_FIELD_MAPPINGS.STORY_POINTS,
        JIRA_FIELD_MAPPINGS.EPIC_LINK,
        JIRA_FIELD_MAPPINGS.TEST_CASE_CREATED,
        // Test Case-specific fields  
        JIRA_FIELD_MAPPINGS.AI_GENERATED_TEST_CASES,
        JIRA_FIELD_MAPPINGS.TEST_TYPE
    ].join(','),
    
    // Expand options for API requests
    EXPAND_OPTIONS: 'changelog',
    
    // Build complete fields parameter for API
    getFieldsParam: function() {
        return `?expand=${this.EXPAND_OPTIONS}&fields=${this.REQUIRED_FIELDS}`;
    },
    
    // Get fields based on issue types (more efficient for specific requests)
    getFieldsForIssueTypes: function(issueTypes = ['Bug']) {
        const commonFields = [
            JIRA_FIELD_MAPPINGS.SPRINT,
            JIRA_FIELD_MAPPINGS.LEADING_TEAM,
            JIRA_FIELD_MAPPINGS.SYSTEM,
            JIRA_FIELD_MAPPINGS.ASSIGNEE,
            JIRA_FIELD_MAPPINGS.STATUS,
            JIRA_FIELD_MAPPINGS.SUMMARY,
            JIRA_FIELD_MAPPINGS.PRIORITY,
            JIRA_FIELD_MAPPINGS.CREATED,
            JIRA_FIELD_MAPPINGS.UPDATED,
            JIRA_FIELD_MAPPINGS.RESOLUTION,
            JIRA_FIELD_MAPPINGS.ISSUE_TYPE,
            JIRA_FIELD_MAPPINGS.COMPONENTS,
            JIRA_FIELD_MAPPINGS.LABELS
        ];
        
        const typeSpecificFields = [];
        
        if (issueTypes.includes('Bug')) {
            typeSpecificFields.push(
                JIRA_FIELD_MAPPINGS.REGRESSION,
                JIRA_FIELD_MAPPINGS.SEVERITY,
                JIRA_FIELD_MAPPINGS.BUG_TYPE
            );
        }
        
        if (issueTypes.includes('Story')) {
            typeSpecificFields.push(
                JIRA_FIELD_MAPPINGS.STORY_POINTS,
                JIRA_FIELD_MAPPINGS.EPIC_LINK,
                JIRA_FIELD_MAPPINGS.TEST_CASE_CREATED
            );
        }
        
        if (issueTypes.includes('Test')) {
            typeSpecificFields.push(
                JIRA_FIELD_MAPPINGS.AI_GENERATED_TEST_CASES,
                JIRA_FIELD_MAPPINGS.TEST_TYPE
            );
        }
        
        return [...commonFields, ...typeSpecificFields].join(',');
    }
};

// Export for use in other modules
if (typeof module !== 'undefined') {
    module.exports = { 
        JIRA_FIELD_MAPPINGS, 
        FIELD_EXTRACTORS, 
        JIRA_API_CONFIG 
    };
}

// Also make available globally in browser
if (typeof window !== 'undefined') {
    window.JIRA_FIELD_MAPPINGS = JIRA_FIELD_MAPPINGS;
    window.FIELD_EXTRACTORS = FIELD_EXTRACTORS;
    window.JIRA_API_CONFIG = JIRA_API_CONFIG;
}