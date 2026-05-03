/**
 * JIRA REST client built on UrlFetchApp. Port of api/jira-bugs.js, but
 * trimmed to what the web app actually needs: paginated multi-type fetch
 * via /rest/api/3/search/jql.
 */

/**
 * Build a JIRA client from Script Properties.
 * Required properties: JIRA_DOMAIN, JIRA_EMAIL, JIRA_API_TOKEN.
 */
function buildJiraClient_() {
  var props = PropertiesService.getScriptProperties();
  var domain = props.getProperty('JIRA_DOMAIN');
  var email = props.getProperty('JIRA_EMAIL');
  var token = props.getProperty('JIRA_API_TOKEN');

  if (!domain || !email || !token) {
    throw new Error(
      'JIRA credentials not configured. Set JIRA_DOMAIN, JIRA_EMAIL, ' +
      'JIRA_API_TOKEN under Project Settings -> Script Properties.'
    );
  }

  return new JiraClient_(domain, email, token);
}

/**
 * @constructor
 * @param {string} domain  e.g. "hibob.atlassian.net"
 * @param {string} email   account email used for basic auth
 * @param {string} token   API token
 */
function JiraClient_(domain, email, token) {
  this.domain = domain;
  this.baseUrl = 'https://' + domain;
  this.authHeader = 'Basic ' + Utilities.base64Encode(email + ':' + token);
}

/**
 * POST helper used by the search endpoint.
 */
JiraClient_.prototype.postJson_ = function (path, payload) {
  var response = UrlFetchApp.fetch(this.baseUrl + path, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: this.authHeader,
      Accept: 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var text = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('JIRA POST ' + path + ' failed: HTTP ' + code + ' - ' +
      (text ? text.substring(0, 500) : ''));
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('JIRA POST ' + path + ' returned non-JSON: ' + e.message);
  }
};

/**
 * Build a JQL string for the given issue types. Mirrors
 * buildJqlForIssueTypes from api/jira-bugs.js.
 *
 * @param {string[]} issueTypes   e.g. ['Bug', 'Story', 'Test']
 * @param {{sinceIso?: string}=} opts
 *   When opts.sinceIso is provided, emits an incremental query shape:
 *     issuetype in (Bug, Story, "Test Case") AND updated >= "yyyy-MM-dd HH:mm"
 *   We intentionally drop the per-type status / bugType filters in incremental
 *   mode so "scope escapes" (e.g., Bug retyped off Production, Story moved to
 *   Cancelled) come back and can be removed in the merge step. The full-sync
 *   JQL keeps the per-type filters exactly as before.
 */
JiraClient_.prototype.buildJqlForIssueTypes_ = function (issueTypes, opts) {
  if (!issueTypes || issueTypes.length === 0) {
    throw new Error('At least one issue type must be specified');
  }

  var conditions = [];
  if (issueTypes.indexOf('Bug') !== -1) {
    conditions.push('type = Bug AND "bug type[dropdown]" = Production');
  }
  if (issueTypes.indexOf('Story') !== -1) {
    conditions.push('type = Story AND status NOT IN (Canceled, Rejected)');
  }
  if (issueTypes.indexOf('Test') !== -1) {
    conditions.push('type = "Test Case" AND status NOT IN (Canceled, Rejected)');
  }

  var scopeJql;
  if (conditions.length === 0) {
    throw new Error('No recognized issue types');
  } else if (conditions.length === 1) {
    scopeJql = conditions[0];
  } else {
    scopeJql = conditions.map(function (c) { return '(' + c + ')'; }).join(' OR ');
  }

  var sinceIso = opts && opts.sinceIso ? opts.sinceIso : null;
  if (!sinceIso) return scopeJql;

  // Incremental mode: keep the per-type scope filters in JQL so every returned
  // issue is guaranteed in scope (JIRA-side filter). We then just upsert on
  // merge. Scope escapes (e.g., bug retyped off Production, story moved to
  // Cancelled) are NOT visible via incremental — by design — and get
  // reconciled on the next daily auto-full-sync. We previously tried to
  // broaden the JQL and re-check scope client-side, but the bugType extractor
  // returns null for Production bugs (latent field-ID mismatch in
  // JIRA_FIELD_MAPPINGS.BUG_TYPE), which caused every returned Production bug
  // to be wrongly removed from the cache.
  return '(' + scopeJql + ') AND updated >= "' + formatJqlDateTime_(sinceIso) + '"';
};

/**
 * Convert an ISO timestamp to JIRA's JQL date format (minute precision).
 * JIRA's `updated` field supports "yyyy-MM-dd HH:mm" for comparisons.
 * Returns the input as-is if it doesn't match the expected ISO shape.
 */
function formatJqlDateTime_(iso) {
  if (!iso) return iso;
  var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return iso;
  return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
}

/**
 * Encode the same per-type filtering rules as the full-sync JQL so we can
 * decide, after an incremental fetch, whether each returned issue is still
 * in scope (upsert) or has escaped scope (remove from cache).
 *
 * Mirrors buildJqlForIssueTypes_ full-sync branches:
 *   - Bug  : bugType = Production
 *   - Story: status NOT IN (Canceled, Rejected)
 *   - Test : status NOT IN (Canceled, Rejected)
 *
 * Accepts a RAW JIRA issue (the shape returned by /search/jql), not a
 * processed cache entry.
 *
 * @param {Object} rawIssue
 * @return {boolean}
 */
function issueMatchesFilter_(rawIssue) {
  if (!rawIssue || !rawIssue.fields) return false;
  var f = rawIssue.fields;
  var issueType = FIELD_EXTRACTORS.getIssueTypeName(f.issuetype);
  var status = FIELD_EXTRACTORS.getStatusName(f.status);

  if (issueType === 'Bug') {
    var bugType = FIELD_EXTRACTORS.getCustomFieldValue(f[JIRA_FIELD_MAPPINGS.BUG_TYPE]);
    return bugType === 'Production';
  }
  if (issueType === 'Story') {
    return status !== 'Canceled' && status !== 'Cancelled' && status !== 'Rejected';
  }
  if (issueType === 'Test' || issueType === 'Test Case') {
    return status !== 'Canceled' && status !== 'Cancelled' && status !== 'Rejected';
  }
  return false;
}

/**
 * Single page of results, paginated via nextPageToken.
 *
 * @param {string[]} issueTypes  e.g. ['Bug', 'Story', 'Test']
 * @param {number}   maxResults  per-page limit (JIRA caps at 100)
 * @param {string=}  nextPageToken optional token from previous page
 * @param {{sinceIso?: string}=} opts
 *   When opts.sinceIso is provided we build an incremental JQL and request
 *   the union of all type-specific fields so the single consolidated query
 *   returns everything processJiraIssue_ needs — no matter which of
 *   Bug/Story/Test comes back on any given page.
 */
JiraClient_.prototype.getIssuesPage = function (issueTypes, maxResults, nextPageToken, opts) {
  var since = opts && opts.sinceIso ? opts.sinceIso : null;
  var baseJql = this.buildJqlForIssueTypes_(issueTypes, since ? { sinceIso: since } : undefined);
  // Incremental: order by `updated ASC` so pagination is deterministic even if
  // more issues are updated mid-sync. Full sync keeps the historical
  // "created DESC" order the dashboard was tested against.
  var jql = baseJql + (since ? ' ORDER BY updated ASC' : ' ORDER BY created DESC');

  var fields = since
    ? JIRA_API_CONFIG.getFieldsForIssueTypes(['Bug', 'Story', 'Test'])
    : JIRA_API_CONFIG.getFieldsForIssueTypes(issueTypes);

  var payload = {
    jql: jql,
    maxResults: maxResults || 100,
    expand: JIRA_API_CONFIG.EXPAND_OPTIONS,
    fields: fields
  };
  if (nextPageToken) payload.nextPageToken = nextPageToken;

  return this.postJson_('/rest/api/3/search/jql', payload);
};

/**
 * Drain all pages for one JQL stream (Bug, Story, or Test only).
 * Retries transient gateway / rate-limit failures — parallel multi-stream
 * fetchAll was triggering nginx 504s under load.
 *
 * @param {string[]} singleTypeArray
 * @param {{sinceIso?: string, maxPages?: number, label?: string}=} opts
 * @return {{ issues: Array, pages: number }}
 */
JiraClient_.prototype.drainSingleTypeStream_ = function (singleTypeArray, opts) {
  var label = (opts && opts.label) || singleTypeArray.join(',');
  var accumulated = [];
  var nextPageToken = null;
  var page = 0;
  var maxPages = (opts && opts.maxPages) || 200;
  var pageOpts = opts && opts.sinceIso ? { sinceIso: opts.sinceIso } : undefined;

  Logger.log('drainSingleTypeStream_: stream ' + label + ' starting' +
    (pageOpts ? ' (incremental since=' + opts.sinceIso + ')' : ''));
  do {
    page++;
    var response = this.getIssuesPageWithRetry_(singleTypeArray, 100, nextPageToken, label, pageOpts);
    if (!response || !response.issues) break;
    accumulated = accumulated.concat(response.issues);
    Logger.log('  ' + label + ' page ' + page + ': +' + response.issues.length +
      ' (subtotal ' + accumulated.length + ')');
    if (response.isLast || !response.nextPageToken) break;
    nextPageToken = response.nextPageToken;
  } while (page < maxPages);

  return { issues: accumulated, pages: page };
};

/**
 * POST search with retries for 429 / 502 / 503 / 504 (gateway overload / timeout).
 */
JiraClient_.prototype.getIssuesPageWithRetry_ = function (issueTypes, maxResults, nextPageToken, streamLabel, opts) {
  var maxAttempts = 4;
  var lastErr = null;
  var streamLabelSafe = streamLabel || issueTypes.join(',');
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return this.getIssuesPage(issueTypes, maxResults, nextPageToken, opts);
    } catch (e) {
      lastErr = e;
      var msg = String(e && e.message ? e.message : e);
      var retryable = /HTTP (429|502|503|504)\b/.test(msg) ||
        /time-?out/i.test(msg) ||
        /Gateway Time-?out/i.test(msg);
      if (!retryable || attempt === maxAttempts) {
        throw e;
      }
      var waitSec = Math.min(45, 5 * attempt);
      Logger.log(streamLabelSafe + ' JIRA retry ' + attempt + '/' + maxAttempts +
        ' after: ' + msg.substring(0, 140) + ' — wait ' + waitSec + 's');
      Utilities.sleep(waitSec * 1000);
    }
  }
  throw lastErr;
};

/**
 * Drain all issues: **sequential** Bug → Story → Test streams (one JQL at a time).
 * Avoids concurrent /search/jql calls that often produce HTTP 504 from Atlassian.
 *
 * Returns { issues: Array }.
 */
JiraClient_.prototype.getAllIssues = function (issueTypes) {
  if (!issueTypes || issueTypes.length === 0) {
    throw new Error('At least one issue type must be specified');
  }

  var allIssues = [];
  var totalPageRounds = 0;

  if (issueTypes.indexOf('Bug') !== -1) {
    var b = this.drainSingleTypeStream_(['Bug']);
    allIssues = allIssues.concat(b.issues);
    totalPageRounds += b.pages;
  }
  if (issueTypes.indexOf('Story') !== -1) {
    var st = this.drainSingleTypeStream_(['Story']);
    allIssues = allIssues.concat(st.issues);
    totalPageRounds += st.pages;
  }
  if (issueTypes.indexOf('Test') !== -1) {
    var te = this.drainSingleTypeStream_(['Test']);
    allIssues = allIssues.concat(te.issues);
    totalPageRounds += te.pages;
  }

  Logger.log('getAllIssues complete: ' + allIssues.length + ' issues (' +
    totalPageRounds + ' page fetch(es), sequential streams)');
  return { issues: allIssues, total: allIssues.length, pages: totalPageRounds };
};

/**
 * Fetch issues updated since a given ISO timestamp — the incremental-sync
 * workhorse. Uses ONE consolidated JQL covering all requested issue types
 * (`issuetype in (...) AND updated >= "..."`) so we pay a single paginated
 * round-trip set instead of the three sequential streams full sync uses.
 *
 * Returns the raw JIRA response shape expected by processJiraIssue_.
 *
 * @param {string[]} issueTypes  e.g. ['Bug', 'Story', 'Test']
 * @param {string}   sinceIso    ISO timestamp — JQL is applied minute-resolution
 * @return {{ issues: Array, total: number, pages: number }}
 */
JiraClient_.prototype.getUpdatedIssues = function (issueTypes, sinceIso) {
  if (!issueTypes || issueTypes.length === 0) {
    throw new Error('At least one issue type must be specified');
  }
  if (!sinceIso) {
    throw new Error('sinceIso is required for getUpdatedIssues');
  }

  var label = 'incremental(' + issueTypes.join(',') + ')';
  Logger.log('getUpdatedIssues: ' + label + ' since=' + sinceIso);
  var stream = this.drainSingleTypeStream_(issueTypes, {
    sinceIso: sinceIso,
    label: label,
    maxPages: 200
  });
  Logger.log('getUpdatedIssues complete: ' + stream.issues.length + ' issues (' +
    stream.pages + ' page fetch(es))');
  return { issues: stream.issues, total: stream.issues.length, pages: stream.pages };
};

/**
 * Convert a JIRA Atlassian Document Format description to plain text.
 * Used to populate the description field of cached issues (kept off the
 * public lightweight payload for security reasons — see Code.gs).
 */
function adfToPlainText_(adf) {
  if (!adf || !adf.content) return '';
  var out = [];
  function walk(node) {
    if (!node) return;
    if (node.type === 'text' && typeof node.text === 'string') out.push(node.text);
    if (node.content && node.content.length) {
      for (var i = 0; i < node.content.length; i++) walk(node.content[i]);
    }
  }
  for (var i = 0; i < adf.content.length; i++) walk(adf.content[i]);
  return out.join('').trim();
}

// ---------------------------------------------------------------------------
// Issue processing — shape parity with api/bug-api-server.js processIssuesData.
// Keep this aligned with that function; the dashboard expects this exact shape.
// ---------------------------------------------------------------------------

/**
 * Build M/D/YYYY display strings the dashboard expects (slash-separated month
 * first). Never use toLocaleDateString() here — Apps Script resolves Hebrew
 * locale and emits "30.4.2026", which breaks client-side KPI parsing.
 */
function formatDateMDY_(iso) {
  if (!iso) return null;
  var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return parseInt(m[2], 10) + '/' + parseInt(m[3], 10) + '/' + m[1];
}

/**
 * Days between created and now (rounded up).
 */
function calculateDaysOpen_(createdIso) {
  var created = new Date(createdIso).getTime();
  var now = Date.now();
  return Math.ceil(Math.abs(now - created) / 86400000);
}

/**
 * Days between two ISO dates, rounded up. Returns null when either is missing.
 */
function calculateFixDuration_(createdIso, resolvedIso) {
  if (!createdIso || !resolvedIso) return null;
  var c = new Date(createdIso).getTime();
  var r = new Date(resolvedIso).getTime();
  return Math.ceil(Math.abs(r - c) / 86400000);
}

/**
 * Find the date the issue moved into a target status (e.g. "Done", "Deployed").
 */
function extractStatusChangeDate_(histories, targetStatus) {
  if (!histories || !histories.length) return null;
  for (var i = histories.length - 1; i >= 0; i--) {
    var h = histories[i];
    if (!h.items) continue;
    for (var j = 0; j < h.items.length; j++) {
      var item = h.items[j];
      if (item.field === 'status' &&
        (item.toString === targetStatus || item.to === targetStatus)) {
        return h.created;
      }
    }
  }
  return null;
}

/**
 * Convert a raw JIRA issue into the cached lightweight-friendly form. Output
 * shape matches api/bug-api-server.js processIssuesData() so the dashboard
 * does not need any per-runtime branching.
 */
function processJiraIssue_(issue) {
  var f = issue.fields || {};
  var issueType = FIELD_EXTRACTORS.getIssueTypeName(f.issuetype);
  var status = FIELD_EXTRACTORS.getStatusName(f.status);
  var sprintFieldRaw = f[JIRA_FIELD_MAPPINGS.SPRINT];
  var sprintName = FIELD_EXTRACTORS.getSprintName(sprintFieldRaw);

  var base = {
    key: issue.key,
    project: (issue.key || '').split('-')[0],
    summary: f.summary || '',
    status: status,
    priority: f.priority ? f.priority.name : null,
    assignee: FIELD_EXTRACTORS.getUserDisplayName(f.assignee),
    reporter: FIELD_EXTRACTORS.getUserDisplayName(f.reporter),
    created: f.created,
    updated: f.updated,
    createdDate: formatDateMDY_(f.created),
    updatedDate: formatDateMDY_(f.updated),
    daysOpen: f.created ? calculateDaysOpen_(f.created) : null,

    leadingTeam: FIELD_EXTRACTORS.getCustomFieldValue(f[JIRA_FIELD_MAPPINGS.LEADING_TEAM]),
    system: FIELD_EXTRACTORS.getCustomFieldValue(f[JIRA_FIELD_MAPPINGS.SYSTEM]),
    components: f.components || [],
    labels: f.labels || [],

    sprintName: sprintName,
    sprint: sprintName, // dashboard compatibility
    allSprints: FIELD_EXTRACTORS.getAllSprintNames(sprintFieldRaw),
    issueType: issueType,

    resolutionDate: null,
    resolutionDateFormatted: null,
    resolutiondate: f[JIRA_FIELD_MAPPINGS.RESOLUTION_DATE] || null
  };

  // Resolution / fix-duration handling — same logic as the Node server.
  if (issue.changelog && issue.changelog.histories) {
    var resolutionDate = null;
    if (issueType === 'Story' && status === 'Done') {
      resolutionDate = extractStatusChangeDate_(issue.changelog.histories, 'Done');
    } else if (issueType === 'Bug') {
      resolutionDate = extractStatusChangeDate_(issue.changelog.histories, 'Deployed');
    }
    if (resolutionDate) {
      base.resolutionDate = resolutionDate;
      base.resolutionDateFormatted = formatDateMDY_(resolutionDate);
      if (issueType === 'Story' && status === 'Done') {
        base.fixDuration = calculateFixDuration_(base.created, resolutionDate);
      }
    }
  }

  // Stories: Fix Duration uses native JIRA resolutiondate (dashboard parity, May 2026).
  var nativeRes = f[JIRA_FIELD_MAPPINGS.RESOLUTION_DATE];
  if (issueType === 'Story' && nativeRes) {
    base.fixDuration = calculateFixDuration_(base.created, nativeRes);
  }

  if (issueType === 'Bug') {
    base.regression = FIELD_EXTRACTORS.getCustomFieldValue(f[JIRA_FIELD_MAPPINGS.REGRESSION]);
    base.severity = FIELD_EXTRACTORS.getCustomFieldValue(f[JIRA_FIELD_MAPPINGS.SEVERITY]);
    base.bugType = FIELD_EXTRACTORS.getCustomFieldValue(f[JIRA_FIELD_MAPPINGS.BUG_TYPE]);
    base.classification = FIELD_EXTRACTORS.getCustomFieldValue(f[JIRA_FIELD_MAPPINGS.CLASSIFICATION]) || 'N/A';
    base.businessProcessClassification =
      FIELD_EXTRACTORS.getCustomFieldValue(f[JIRA_FIELD_MAPPINGS.BUSINESS_PROCESS_CLASSIFICATION]) || 'N/A';
  } else if (issueType === 'Story') {
    base.storyPoints = FIELD_EXTRACTORS.getStoryPoints(f[JIRA_FIELD_MAPPINGS.STORY_POINTS]);
    base.epicLink = FIELD_EXTRACTORS.getEpicLink(f[JIRA_FIELD_MAPPINGS.EPIC_LINK]);
    base.testCaseCreated = FIELD_EXTRACTORS.getTestCaseCreated(f[JIRA_FIELD_MAPPINGS.TEST_CASE_CREATED]);
  } else if (issueType === 'Test Case' || issueType === 'Test') {
    base.testType = FIELD_EXTRACTORS.getCustomFieldValue(f[JIRA_FIELD_MAPPINGS.TEST_TYPE]);
    base.generatedFromAI = FIELD_EXTRACTORS.getAIGeneratedTestCases(
      f[JIRA_FIELD_MAPPINGS.AI_GENERATED_TEST_CASES],
      f[JIRA_FIELD_MAPPINGS.TEST_TYPE]
    );
    var rawAi = FIELD_EXTRACTORS.getCustomFieldValue(f[JIRA_FIELD_MAPPINGS.AI_GENERATED_TEST_CASES]);
    base.aiGeneratedTestCases = rawAi || null;
  }

  base.description = f.description ? adfToPlainText_(f.description) : '';
  return base;
}
