/**
 * Field extractors for JIRA issues. Direct port of api/jira-field-mappings.js.
 *
 * IMPORTANT: This file preserves the April 2026 fixes + loose-coverage sprint list:
 *   - getSprintName returns the EARLIEST sprint by startDate (unified for all types).
 *   - getAllSprintNames returns all sprint names ascending by startDate (Testing Coverage loose mode).
 *   - getTestCaseCreated handles JIRA checkbox array format [{value: "Yes"}].
 *   - getStoryPoints uses customfield_10032 (corrected April 27, 2026).
 *
 * Apps Script runs V8 JavaScript so the Node code ports nearly verbatim. We
 * use plain global objects (no `module.exports`) because Apps Script files
 * share a single global scope.
 */

// ---------------------------------------------------------------------------
// JIRA custom field IDs (must match api/jira-field-mappings.js exactly).
// ---------------------------------------------------------------------------
var JIRA_FIELD_MAPPINGS = {
  SPRINT: 'customfield_10020',
  LEADING_TEAM: 'customfield_10574',
  SYSTEM: 'customfield_10107',
  REGRESSION: 'customfield_10106',
  SEVERITY: 'customfield_10104',
  BUG_TYPE: 'customfield_10578',
  CLASSIFICATION: 'customfield_10797',
  BUSINESS_PROCESS_CLASSIFICATION: 'customfield_12110',

  // Story-specific
  STORY_POINTS: 'customfield_10032',
  EPIC_LINK: 'customfield_10014',
  TEST_CASE_CREATED: 'customfield_11391',

  // Test-case-specific
  AI_GENERATED_TEST_CASES: 'customfield_11392',
  TEST_TYPE: 'customfield_11426',

  // Standard fields
  ASSIGNEE: 'assignee',
  REPORTER: 'reporter',
  STATUS: 'status',
  PRIORITY: 'priority',
  SUMMARY: 'summary',
  DESCRIPTION: 'description',
  CREATED: 'created',
  UPDATED: 'updated',
  RESOLUTION: 'resolution',
  RESOLUTION_DATE: 'resolutiondate',
  COMPONENTS: 'components',
  LABELS: 'labels',
  ISSUE_TYPE: 'issuetype'
};

var FIELD_EXTRACTORS = {
  /**
   * Extract a display value from a single-select / dropdown custom field.
   * Handles array, object-with-.value, and plain-string formats.
   */
  getCustomFieldValue: function (fieldData) {
    if (!fieldData) return null;
    if (Array.isArray(fieldData)) {
      return fieldData.length > 0 ? (fieldData[0].value || fieldData[0]) : null;
    }
    if (typeof fieldData === 'object' && fieldData.value) {
      return fieldData.value;
    }
    if (typeof fieldData === 'string') return fieldData;
    return null;
  },

  /**
   * Extract Test Case Created (JIRA checkbox field).
   * Returns 'Yes' or 'No' so the dashboard's Story filter works correctly.
   */
  getTestCaseCreated: function (fieldData) {
    if (!fieldData) return 'No';

    if (Array.isArray(fieldData)) {
      for (var i = 0; i < fieldData.length; i++) {
        var item = fieldData[i];
        if (typeof item === 'string' && item === 'Yes') return 'Yes';
        if (typeof item === 'object' && item !== null && item.value === 'Yes') return 'Yes';
      }
      return 'No';
    }

    if (typeof fieldData === 'object' && fieldData !== null && fieldData.value === 'Yes') {
      return 'Yes';
    }
    if (typeof fieldData === 'string' && fieldData === 'Yes') return 'Yes';
    return 'No';
  },

  /**
   * Returns the EARLIEST sprint name (by startDate) — unified logic for all
   * issue types since the April 2026 fix.
   */
  getSprintName: function (sprintField) {
    if (!sprintField || !Array.isArray(sprintField) || sprintField.length === 0) return null;

    var withStart = [];
    for (var i = 0; i < sprintField.length; i++) {
      var s = sprintField[i];
      if (s && s.startDate) withStart.push(s);
    }
    withStart.sort(function (a, b) {
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });

    if (withStart.length > 0) return withStart[0].name || null;
    return sprintField[0].name || null;
  },

  /**
   * All sprint names on the issue, ascending by startDate (deduped).
   * Mirrors api/jira-field-mappings.js getAllSprintNames.
   */
  getAllSprintNames: function (sprintField) {
    if (!Array.isArray(sprintField) || sprintField.length === 0) return [];

    var withNames = [];
    for (var j = 0; j < sprintField.length; j++) {
      var sp = sprintField[j];
      if (sp && sp.name) withNames.push(sp);
    }

    withNames.sort(function (a, b) {
      var ad = a.startDate ? new Date(a.startDate).getTime() : 0;
      var bd = b.startDate ? new Date(b.startDate).getTime() : 0;
      return ad - bd;
    });

    var seen = {};
    var out = [];
    for (var k = 0; k < withNames.length; k++) {
      var nm = withNames[k].name;
      if (nm && !seen[nm]) {
        seen[nm] = true;
        out.push(nm);
      }
    }
    return out;
  },

  getUserDisplayName: function (userField) {
    if (!userField) return null;
    return userField.displayName || userField.name || null;
  },

  getStatusName: function (statusField) {
    if (!statusField) return null;
    return statusField.name || null;
  },

  getIssueTypeName: function (issueTypeField) {
    if (!issueTypeField) return null;
    return issueTypeField.name || null;
  },

  /**
   * Story points (numeric). Reads customfield_10032 — the April 27, 2026
   * fix moved off customfield_10016 which always returned null.
   */
  getStoryPoints: function (storyPointsField) {
    if (!storyPointsField) return 0;
    var n = parseFloat(storyPointsField);
    return isNaN(n) ? 0 : n;
  },

  getEpicLink: function (epicLinkField) {
    if (!epicLinkField) return null;
    if (typeof epicLinkField === 'string') return epicLinkField;
    return epicLinkField.key || epicLinkField.name || null;
  },

  /**
   * AI Generated Test Cases — the testType field is the source of truth, not
   * the URL field, since the URL can be a stale template.
   */
  getAIGeneratedTestCases: function (_aiFieldData, testTypeFieldData) {
    var testTypeValue = FIELD_EXTRACTORS.getCustomFieldValue(testTypeFieldData);
    return testTypeValue === 'Yes' ? 'Yes' : 'No';
  }
};

// ---------------------------------------------------------------------------
// Field-list builder used when calling the JIRA search API. Mirrors
// JIRA_API_CONFIG.getFieldsForIssueTypes from api/jira-field-mappings.js.
// ---------------------------------------------------------------------------
var JIRA_API_CONFIG = {
  EXPAND_OPTIONS: 'changelog',

  getFieldsForIssueTypes: function (issueTypes) {
    issueTypes = issueTypes || ['Bug'];

    var common = [
      JIRA_FIELD_MAPPINGS.SPRINT,
      JIRA_FIELD_MAPPINGS.LEADING_TEAM,
      JIRA_FIELD_MAPPINGS.SYSTEM,
      JIRA_FIELD_MAPPINGS.ASSIGNEE,
      JIRA_FIELD_MAPPINGS.REPORTER,
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

    var typeSpecific = [];

    if (issueTypes.indexOf('Bug') !== -1) {
      typeSpecific.push(
        JIRA_FIELD_MAPPINGS.REGRESSION,
        JIRA_FIELD_MAPPINGS.SEVERITY,
        JIRA_FIELD_MAPPINGS.BUG_TYPE,
        JIRA_FIELD_MAPPINGS.CLASSIFICATION,
        JIRA_FIELD_MAPPINGS.BUSINESS_PROCESS_CLASSIFICATION
      );
    }
    if (issueTypes.indexOf('Story') !== -1) {
      typeSpecific.push(
        JIRA_FIELD_MAPPINGS.STORY_POINTS,
        JIRA_FIELD_MAPPINGS.EPIC_LINK,
        JIRA_FIELD_MAPPINGS.TEST_CASE_CREATED
      );
    }
    if (issueTypes.indexOf('Test') !== -1) {
      typeSpecific.push(
        JIRA_FIELD_MAPPINGS.AI_GENERATED_TEST_CASES,
        JIRA_FIELD_MAPPINGS.TEST_TYPE
      );
    }

    return common.concat(typeSpecific);
  }
};
