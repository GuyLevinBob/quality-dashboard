/**
 * Pre-computed Testing Coverage payload, mirrored to CacheService during sync
 * so ?action=testing-coverage doesn't need the 5 MB Drive cache read.
 *
 * Shape stored in CacheService matches the response body of
 * handleTestingCoverage_ exactly so the warm path can return it as-is.
 *
 * Cache layout (chunked because CacheService caps each value at 100 KB):
 *   tcLite:lastSync     -> string (sync timestamp, used for invalidation)
 *   tcLite:n            -> number-of-chunks
 *   tcLite:0..n-1       -> JSON.stringify(payload) split into 90 KB chunks
 *
 * Keys + chunking are intentionally the same shape as the issues lite cache
 * (see Code.gs LITE_CACHE_*) so future maintenance is easier.
 */

var TC_CACHE_PREFIX_ = 'tcLite:';
var TC_CACHE_CHUNK_ = 90000;
var TC_CACHE_TTL_SEC_ = 21600;

var TC_VALID_TEAMS_ = ['MIS - GTM', 'MIS - GTC', 'MIS - CORP', 'MIS - Platform'];
var TC_INVALID_STATUSES_ = ['Canceled', 'Reject', 'Rejected'];

/**
 * Build the same payload shape that handleTestingCoverage_ returns, but from
 * an in-memory issues array instead of the Drive cache.
 *
 * @param {Array} issues  full issues array (Bugs + Stories + Tests)
 * @param {string} lastSync  ISO timestamp from cache
 * @param {string} jiraInstance  for metadata.jiraInstance
 * @returns {Object}
 */
function computeTestingCoveragePayload_(issues, lastSync, jiraInstance) {
  issues = issues || [];

  var stories = issues.filter(function (i) { return i && i.issueType === 'Story'; });
  var filtered = stories.filter(function (s) {
    var pts = parseFloat(s.storyPoints) || 0;
    var teamOk = TC_VALID_TEAMS_.indexOf(s.leadingTeam) !== -1;
    var statusOk = TC_INVALID_STATUSES_.indexOf(s.status) === -1;
    return pts >= 0.5 && teamOk && statusOk;
  });

  var teamBreakdown = {};
  var testCaseBreakdown = {};
  filtered.forEach(function (s) {
    var team = s.leadingTeam || 'No Team';
    teamBreakdown[team] = (teamBreakdown[team] || 0) + 1;
    var tc = s.testCaseCreated || 'No Value';
    testCaseBreakdown[tc] = (testCaseBreakdown[tc] || 0) + 1;
  });

  return {
    stories: filtered.map(toLightweightIssue_),
    total: filtered.length,
    metadata: {
      query: 'Testing Coverage Analytics',
      criteria: 'Stories >=0.5 points, MIS teams, not cancelled/rejected',
      timestamp: new Date().toISOString(),
      jiraInstance: jiraInstance || 'hibob.atlassian.net',
      lastSync: lastSync || null,
      teams: TC_VALID_TEAMS_.slice(),
      teamBreakdown: teamBreakdown,
      testCaseBreakdown: testCaseBreakdown,
      filtering: {
        inputStories: stories.length,
        outputStories: filtered.length,
        filterEfficiency: stories.length === 0 ? '0%' :
          Math.round((filtered.length / stories.length) * 100) + '%'
      }
    }
  };
}

/**
 * Persist the precomputed testing-coverage payload to chunked CacheService
 * entries keyed by lastSync.
 *
 * @param {Array} issues  full issues array (post processJiraIssue_)
 * @param {string} lastSync
 */
function persistTestingCoveragePayload_(issues, lastSync) {
  if (!lastSync) return;
  var jiraInstance = PropertiesService.getScriptProperties().getProperty('JIRA_DOMAIN') ||
    'hibob.atlassian.net';
  var payload = computeTestingCoveragePayload_(issues, lastSync, jiraInstance);
  var json = JSON.stringify(payload);
  var cache = CacheService.getScriptCache();
  var n = Math.ceil(json.length / TC_CACHE_CHUNK_);
  cache.put(TC_CACHE_PREFIX_ + 'lastSync', String(lastSync), TC_CACHE_TTL_SEC_);
  cache.put(TC_CACHE_PREFIX_ + 'n', String(n), TC_CACHE_TTL_SEC_);
  for (var i = 0; i < n; i++) {
    cache.put(
      TC_CACHE_PREFIX_ + i,
      json.substring(i * TC_CACHE_CHUNK_, (i + 1) * TC_CACHE_CHUNK_),
      TC_CACHE_TTL_SEC_
    );
  }
  Logger.log('persistTestingCoveragePayload_: ' + n + ' chunk(s), ' + payload.total + ' stories');
}

/**
 * Read the precomputed testing-coverage payload back, returning null if the
 * cache is empty or the lastSync no longer matches (i.e. data was synced after
 * the cache was warmed).
 *
 * @param {string} expectedLastSync
 * @returns {Object|null}
 */
function loadTestingCoveragePayload_(expectedLastSync) {
  if (!expectedLastSync) return null;
  var cache = CacheService.getScriptCache();
  var meta = cache.getAll([TC_CACHE_PREFIX_ + 'lastSync', TC_CACHE_PREFIX_ + 'n']);
  var sync = meta[TC_CACHE_PREFIX_ + 'lastSync'];
  var nStr = meta[TC_CACHE_PREFIX_ + 'n'];
  if (!sync || String(sync) !== String(expectedLastSync)) return null;
  if (!nStr) return null;
  var n = parseInt(nStr, 10);
  if (!n || n > 400) return null;

  var keys = [];
  for (var i = 0; i < n; i++) keys.push(TC_CACHE_PREFIX_ + i);
  var chunks = cache.getAll(keys);
  var parts = [];
  for (var j = 0; j < n; j++) {
    var p = chunks[TC_CACHE_PREFIX_ + j];
    if (p == null) return null;
    parts.push(p);
  }
  try {
    return JSON.parse(parts.join(''));
  } catch (e) {
    Logger.log('loadTestingCoveragePayload_: parse failed ' + e.message);
    return null;
  }
}
