/**
 * One-time setup helpers. Run these manually from the Apps Script editor
 * after configuring Script Properties for the first time.
 */

/**
 * Create the Drive cache file if it doesn't exist and store its ID in
 * Script Properties so loadCache() / saveCache() can find it.
 *
 * Idempotent: rerunning is safe — it will reuse the existing file ID.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperty('DRIVE_CACHE_FILE_ID');

  if (existing) {
    try {
      var file = DriveApp.getFileById(existing);
      Logger.log('Cache file already configured: "' + file.getName() +
        '" (id=' + file.getId() + ')');
      _verifyJiraConfiguration();
      return file.getId();
    } catch (e) {
      Logger.log('Stored cache file id ' + existing + ' is not accessible (' +
        e.message + '); creating a new file.');
    }
  }

  var fileName = props.getProperty('CACHE_FILE_NAME') || 'hibob-dashboard-cache.json';
  var seed = JSON.stringify({
    issues: [],
    metadata: {
      totalIssues: 0,
      issueTypes: [],
      jiraInstance: props.getProperty('JIRA_DOMAIN') || 'hibob.atlassian.net',
      createdBy: 'appscript/Setup.setup'
    },
    lastSync: null
  }, null, 2);

  // Create the file with application/json MIME directly. We previously called
  // DriveApp.createFile(...PLAIN_TEXT) and then File.setMimeType('application/json'),
  // but DriveApp's File class has no setMimeType() method (TypeError at runtime).
  // The 3-arg form accepts a raw MIME string, which is exactly what we want.
  var newFile = DriveApp.createFile(fileName, seed, 'application/json');
  props.setProperty('DRIVE_CACHE_FILE_ID', newFile.getId());

  Logger.log('Created cache file "' + fileName + '" (id=' + newFile.getId() + ')');
  _verifyJiraConfiguration();
  return newFile.getId();
}

/**
 * Read-only diagnostic: confirms credentials are set and the cache file
 * is reachable. Safe to call from the editor at any time.
 */
function verify() {
  var props = PropertiesService.getScriptProperties();
  var report = {
    jiraDomain: props.getProperty('JIRA_DOMAIN') || '(missing)',
    jiraEmail: props.getProperty('JIRA_EMAIL') ? '(set)' : '(missing)',
    jiraToken: props.getProperty('JIRA_API_TOKEN') ? '(set)' : '(missing)',
    cacheFileId: props.getProperty('DRIVE_CACHE_FILE_ID') || '(missing)',
    shareTokenConfigured: !!props.getProperty('SHARE_TOKEN'),
    syncCooldownSeconds: getCooldownSeconds_(),
    webAppUrl: ScriptApp.getService().getUrl() || '(not yet deployed)'
  };

  if (report.cacheFileId !== '(missing)') {
    try {
      var file = DriveApp.getFileById(report.cacheFileId);
      report.cacheFileName = file.getName();
      var meta = getCacheMetadata();
      report.cacheLastSync = meta ? meta.lastSync : null;
      report.cacheTotalIssues = meta ? meta.totalIssues : 0;
      report.cacheBreakdown = meta ? meta.breakdown : null;
    } catch (e) {
      report.cacheFileError = e.message;
    }
  }

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Convenience: run a full sync from the Apps Script editor (no HTTP needed).
 * Useful for first-run population of the cache without exposing the web app.
 */
function runInitialSync() {
  Logger.log('Starting initial sync...');
  var result = performSync_(['Bug', 'Story', 'Test']);
  Logger.log('Initial sync complete: ' + JSON.stringify(result));
  return result;
}

/**
 * One-shot helper: read the existing Drive cache file and (re)populate every
 * derived warm-path tier so the next dashboard refresh skips Drive entirely.
 *
 * Use cases:
 *   - After deploying the April 2026 perf fix on a project that already has
 *     a populated cache file: avoids waiting for the next Sync click before
 *     LAST_SYNC / CACHE_META / lite cache / testing-coverage cache exist.
 *   - After CacheService entries naturally expire (6 h TTL): rewarm without
 *     hitting Jira.
 *
 * Safe to call repeatedly. Does NOT contact Jira.
 *
 * @returns {Object} status report with what got warmed.
 */
function warmCachesForCurrentData() {
  var report = {
    cacheLoaded: false,
    issues: 0,
    lastSync: null,
    persistedLastSyncAndMeta: false,
    refreshedIssuesLiteCache: false,
    persistedKpis: false,
    persistedTestingCoverage: false,
    errors: []
  };

  var cache;
  try {
    cache = loadCache();
  } catch (e) {
    report.errors.push('loadCache: ' + e.message);
    Logger.log('warmCachesForCurrentData: ' + e.message);
    return report;
  }

  if (!cache || !cache.issues) {
    Logger.log('warmCachesForCurrentData: Drive cache is empty; nothing to warm.');
    return report;
  }
  report.cacheLoaded = true;
  report.issues = cache.issues.length;
  report.lastSync = cache.lastSync || null;

  try {
    persistLastSyncAndMeta_(cache);
    report.persistedLastSyncAndMeta = true;
  } catch (e1) { report.errors.push('persistLastSyncAndMeta_: ' + e1.message); }

  try {
    refreshIssuesLiteCacheFromFullPayload_(cache);
    report.refreshedIssuesLiteCache = true;
  } catch (e2) { report.errors.push('refreshIssuesLiteCacheFromFullPayload_: ' + e2.message); }

  try {
    var bugs = cache.issues.filter(function (i) { return i.issueType === 'Bug'; });
    persistDashboardKpis_(bugs, cache.lastSync);
    report.persistedKpis = true;
  } catch (e3) { report.errors.push('persistDashboardKpis_: ' + e3.message); }

  try {
    persistTestingCoveragePayload_(cache.issues, cache.lastSync);
    report.persistedTestingCoverage = true;
  } catch (e4) { report.errors.push('persistTestingCoveragePayload_: ' + e4.message); }

  Logger.log('warmCachesForCurrentData: ' + JSON.stringify(report, null, 2));
  return report;
}

function _verifyJiraConfiguration() {
  var props = PropertiesService.getScriptProperties();
  var missing = [];
  ['JIRA_DOMAIN', 'JIRA_EMAIL', 'JIRA_API_TOKEN'].forEach(function (k) {
    if (!props.getProperty(k)) missing.push(k);
  });
  if (missing.length) {
    Logger.log('WARNING: missing Script Properties: ' + missing.join(', ') +
      '. Add them under Project Settings -> Script Properties before running ' +
      'runInitialSync() or deploying the web app.');
  } else {
    Logger.log('JIRA Script Properties OK.');
  }
}
