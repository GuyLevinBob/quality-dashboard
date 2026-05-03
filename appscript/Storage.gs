/**
 * Drive-backed JSON cache for the dashboard payload.
 *
 * Why Drive and not PropertiesService / CacheService?
 *   - PropertiesService caps each value at 9 KB.
 *   - CacheService caps each key at 100 KB and clears after 6 hours.
 *   - The local `data/cache/issues-cache.json` is ~5.2 MB.
 * A single Drive file holds the full cache and is read on every request.
 *
 * The Drive file ID is stored in the DRIVE_CACHE_FILE_ID Script Property,
 * which is populated by Setup.setup().
 */

var STORAGE_PROP_KEY_ = 'DRIVE_CACHE_FILE_ID';
var STORAGE_DEFAULT_FILE_NAME_ = 'hibob-dashboard-cache.json';

/**
 * Resolve the Drive cache file. Throws if setup() has not been run.
 * @return {GoogleAppsScript.Drive.File}
 */
function getCacheFile_() {
  var fileId = PropertiesService.getScriptProperties().getProperty(STORAGE_PROP_KEY_);
  if (!fileId) {
    throw new Error(
      'Cache file not configured. Run Setup.setup() once from the Apps Script ' +
      'editor to create the Drive file and store its ID.'
    );
  }
  try {
    return DriveApp.getFileById(fileId);
  } catch (e) {
    throw new Error(
      'Cache file ID ' + fileId + ' is not accessible: ' + e.message +
      '. You may need to re-run Setup.setup().'
    );
  }
}

/**
 * Load the entire cache as a parsed object. Returns null on first run /
 * empty file so callers can decide how to react.
 */
function loadCache() {
  var file;
  try {
    file = getCacheFile_();
  } catch (e) {
    Logger.log('loadCache: ' + e.message);
    return null;
  }
  var content = file.getBlob().getDataAsString();
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch (e) {
    Logger.log('loadCache: cache file contained invalid JSON: ' + e.message);
    return null;
  }
}

/**
 * Atomically replace the cache content. The shape mirrors
 * data/cache/issues-cache.json so this file can be diffed against the local
 * cache for parity testing.
 *
 * @param {{issues: Array, metadata: Object, lastSync: string}} payload
 */
function saveCache(payload) {
  var file = getCacheFile_();
  file.setContent(JSON.stringify(payload, null, 2));
  try {
    // Defined in Code.gs — warms CacheService so ?action=issues skips a 5 MB Drive read.
    refreshIssuesLiteCacheFromFullPayload_(payload);
  } catch (e) {
    Logger.log('saveCache: refreshIssuesLiteCacheFromFullPayload_ failed: ' + e.message);
  }
}

/**
 * Convenience reader returning the issues array (or [] on cold start).
 */
function loadIssues() {
  var cache = loadCache();
  return (cache && cache.issues) ? cache.issues : [];
}

/**
 * Quick metadata used by the health endpoint without parsing the whole file.
 */
function getCacheMetadata() {
  var cache = loadCache();
  if (!cache) return null;
  var counts = { Bug: 0, Story: 0, Test: 0, Other: 0 };
  if (cache.issues) {
    for (var i = 0; i < cache.issues.length; i++) {
      var t = cache.issues[i].issueType;
      if (t === 'Bug' || t === 'Story') counts[t]++;
      else if (t === 'Test' || t === 'Test Case') counts.Test++;
      else counts.Other++;
    }
  }
  return {
    totalIssues: cache.issues ? cache.issues.length : 0,
    breakdown: counts,
    lastSync: cache.lastSync || null,
    metadata: cache.metadata || null
  };
}

/**
 * Append a single line to a sibling Drive log file. Used by the access log
 * (sync calls only — read calls would generate too much volume). Logs are
 * best-effort: failures are swallowed because we never want logging to
 * break a sync.
 */
function appendAccessLog(action, detail) {
  try {
    var props = PropertiesService.getScriptProperties();
    var logId = props.getProperty('DRIVE_LOG_FILE_ID');
    var logFile;
    if (logId) {
      logFile = DriveApp.getFileById(logId);
    } else {
      logFile = DriveApp.createFile(
        STORAGE_DEFAULT_FILE_NAME_.replace('.json', '.access.log'),
        ''
      );
      props.setProperty('DRIVE_LOG_FILE_ID', logFile.getId());
    }
    var line = new Date().toISOString() + '\t' + action + '\t' +
      (detail ? JSON.stringify(detail) : '') + '\n';
    var existing = logFile.getBlob().getDataAsString();
    // Cap log to last ~200 KB so it doesn't grow unbounded.
    if (existing.length > 200000) {
      existing = existing.substring(existing.length - 100000);
    }
    logFile.setContent(existing + line);
  } catch (e) {
    Logger.log('appendAccessLog failed: ' + e.message);
  }
}
