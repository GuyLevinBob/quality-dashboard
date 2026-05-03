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
    CLASSIFICATION: 'customfield_10797',   // Classification dropdown (e.g., "Renewal/Auto Renewal") - Bug-only
    BUSINESS_PROCESS_CLASSIFICATION: 'customfield_12110', // Business Processes Classification dropdown (e.g., "Quote 2 Cash") - Bug-only
    
    // Story-specific fields
    STORY_POINTS: 'customfield_10032',     // Story Points field (Fibonacci points) - CORRECTED!
    EPIC_LINK: 'customfield_10014',        // Epic Link field  
    TEST_CASE_CREATED: 'customfield_11391', // Test Case Created field (Yes/No)
    
    // Test Case-specific fields
    AI_GENERATED_TEST_CASES: 'customfield_11392', // AI Generated Test Cases field (URL/text)
    TEST_TYPE: 'customfield_11426',        // Test Type field (AI Generated Test Cases)
    
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
    RESOLUTION_DATE: 'resolutiondate',     // Native JIRA resolution date (ISO timestamp) - used for Story fix duration
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
    
    // Extract test case created checkbox field value
    getTestCaseCreated: (fieldData) => {
        if (!fieldData) return 'No';
        
        // Handle array format - JIRA checkbox fields
        if (Array.isArray(fieldData)) {
            // Check each item in array for "Yes" value
            for (const item of fieldData) {
                // Direct string match
                if (typeof item === 'string' && item === 'Yes') {
                    return 'Yes';
                }
                // Object format: [{value: "Yes", id: "11440", self: "..."}]
                if (typeof item === 'object' && item !== null && item.value === 'Yes') {
                    return 'Yes';
                }
            }
            return 'No'; // Array exists but no "Yes" found
        }
        
        // Handle single object format: {value: "Yes"}
        if (typeof fieldData === 'object' && fieldData !== null && fieldData.value === 'Yes') {
            return 'Yes';
        }
        
        // Handle direct string values
        if (typeof fieldData === 'string' && fieldData === 'Yes') {
            return 'Yes';
        }
        
        return 'No';
    },
    
    // Extract sprint name from sprint object
    getSprintName: (sprintField) => {
        if (!sprintField || !Array.isArray(sprintField) || sprintField.length === 0) {
            return null;
        }
        
        // Get the EARLIEST sprint by sorting by startDate, then take first
        const sortedSprints = sprintField
            .filter(sprint => sprint && sprint.startDate) // Only sprints with start dates
            .sort((a, b) => new Date(a.startDate) - new Date(b.startDate)); // Sort by start date ascending
        
        if (sortedSprints.length > 0) {
            return sortedSprints[0].name || null;
        }
        
        // Fallback: if no startDate, take first sprint in array
        const firstSprint = sprintField[0];
        return firstSprint.name || null;
    },

    /** All sprint names for an issue, ascending by startDate (for Testing Coverage loose mode). */
    getAllSprintNames: (sprintField) => {
        if (!Array.isArray(sprintField) || sprintField.length === 0) return [];
        const withNames = sprintField.filter(s => s && s.name);
        const sorted = [...withNames].sort(
            (a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0)
        );
        return [...new Set(sorted.map(s => s.name))];
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
    },
    
    // Extract AI Generated Test Cases field value based on Test Type field
    getAIGeneratedTestCases: (aiFieldData, testTypeFieldData) => {
        // The real indicator is the testType field, not the URL field
        // testType "Yes" = AI Generated "Yes", anything else = "No"
        const testTypeValue = FIELD_EXTRACTORS.getCustomFieldValue(testTypeFieldData);
        return testTypeValue === 'Yes' ? 'Yes' : 'No';
    },
    
    // Legacy method - kept for backward compatibility but not used for Test Cases
    validateAIGeneratedValue: (value) => {
        if (!value || value === null || value === undefined) return 'No';
        
        // Convert to string for comparison
        const stringValue = String(value).trim();
        
        // Handle explicit "None" values and empty strings
        if (stringValue === '' || stringValue.toLowerCase() === 'none') {
            return 'No';
        }
        
        // Handle template/default URLs that should be treated as "No"
        const templateUrl = 'https://chatgpt.com/g/g-68ff4338eb9081918af1a4c6baa91300-test-case-agent';
        if (stringValue === templateUrl) {
            return 'No';
        }
        
        // Any other non-empty value indicates AI was used
        return 'Yes';
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
        JIRA_FIELD_MAPPINGS.CLASSIFICATION,
        JIRA_FIELD_MAPPINGS.BUSINESS_PROCESS_CLASSIFICATION,
        JIRA_FIELD_MAPPINGS.ASSIGNEE,
        JIRA_FIELD_MAPPINGS.STATUS,
        JIRA_FIELD_MAPPINGS.SUMMARY,
        JIRA_FIELD_MAPPINGS.PRIORITY,
        JIRA_FIELD_MAPPINGS.CREATED,
        JIRA_FIELD_MAPPINGS.UPDATED,
        JIRA_FIELD_MAPPINGS.RESOLUTION,
        JIRA_FIELD_MAPPINGS.RESOLUTION_DATE,
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
            JIRA_FIELD_MAPPINGS.RESOLUTION_DATE,
            JIRA_FIELD_MAPPINGS.ISSUE_TYPE,
            JIRA_FIELD_MAPPINGS.COMPONENTS,
            JIRA_FIELD_MAPPINGS.LABELS
        ];
        
        const typeSpecificFields = [];
        
        if (issueTypes.includes('Bug')) {
            typeSpecificFields.push(
                JIRA_FIELD_MAPPINGS.REGRESSION,
                JIRA_FIELD_MAPPINGS.SEVERITY,
                JIRA_FIELD_MAPPINGS.BUG_TYPE,
                JIRA_FIELD_MAPPINGS.CLASSIFICATION,
                JIRA_FIELD_MAPPINGS.BUSINESS_PROCESS_CLASSIFICATION
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