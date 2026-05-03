/**
 * Apps Script web-app entry point.
 *
 * Routing rules (mirror the local Node API in api/bug-api-server.js so the
 * dashboard does not need per-runtime branching beyond URL construction):
 *
 *   GET   ?action=issues&types=Bug,Story,Test  -> /api/issues-lite
 *   GET   ?action=sync&types=Bug,Story,Test    -> /api/sync-issues   (POST in Node)
 *   GET   ?action=testing-coverage             -> /api/testing-coverage
 *   GET   ?action=health                       -> /health
 *   GET   ?action=kpis                         -> KPI tiles JSON (aligned with dashboard)
 *   GET   (no action)                          -> serves Index.html (dashboard)
 *
 * Apps Script web apps only support GET via doGet and POST via doPost in a
 * way that participates in the iframe sandbox. The dashboard's Sync button
 * therefore issues a GET against ?action=sync. The cooldown gate in
 * RateLimit.gs prevents accidental abuse.
 */

// ---------------------------------------------------------------------------
// HTTP entry points
// ---------------------------------------------------------------------------

/**
 * @param {GoogleAppsScript.Events.DoGet} e
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action || null;

  // No action -> serve the dashboard HTML.
  if (!action) {
    return serveDashboardHtml_();
  }

  // All data endpoints are gated by the share token (when configured).
  var tokenError = checkShareToken_(params);
  if (tokenError) return tokenError;

  try {
    // Light access log for every action call (sync also logs its own detail).
    appendAccessLog(action, null);

    switch (action) {
      case 'issues':
        return handleIssues_(params);
      case 'kpis':
        return handleKpis_();
      case 'sync':
        return handleSync_(params);
      case 'testing-coverage':
        return handleTestingCoverage_(params);
      case 'health':
        return handleHealth_();
      default:
        return jsonError_(404, 'Unknown action', { action: action });
    }
  } catch (err) {
    return jsonError_(500, 'Server error', { message: String(err && err.message || err) });
  }
}

/**
 * Some browsers / fetch flows preflight via POST. Route to the same handler.
 */
function doPost(e) {
  return doGet(e);
}

// ---------------------------------------------------------------------------
// Dashboard HTML
// ---------------------------------------------------------------------------

function serveDashboardHtml_() {
  // Index.html is generated from ../dashboard-multi-issue.html by build.js.
  // It uses HtmlService templating to inject the web-app URL so the front-end
  // knows where to call back for ?action=issues / ?action=sync.
  var template = HtmlService.createTemplateFromFile('Index');
  template.appsScriptUrl = ScriptApp.getService().getUrl() || '';
  template.shareToken = PropertiesService.getScriptProperties().getProperty('SHARE_TOKEN') || '';
  return template.evaluate()
    .setTitle('HiBob Multi-Issue Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * GET ?action=issues&types=Bug,Story,Test
 * Returns the cached issues filtered to the requested types, with heavy
 * fields stripped (description, changelog) so we don't expose JIRA prose to
 * anyone with the link.
 *
 * Warm-path strategy (added April 2026 to fix ~20 s F5 latency):
 *   1. Read LAST_SYNC + CACHE_META from Script Properties (~30 ms total).
 *   2. Try the chunked CacheService lite cache keyed by LAST_SYNC.
 *   3. On hit, filter by type and return — never touches the 5 MB Drive file.
 *   4. Only on cold-start / cache eviction do we fall back to loadCache(), and
 *      we re-warm the lite cache from the freshly-loaded payload so the next
 *      request takes the warm path.
 */
function handleIssues_(params) {
  var types = parseTypes_(params.types);
  var jiraInstanceFallback = PropertiesService.getScriptProperties().getProperty('JIRA_DOMAIN') ||
    'hibob.atlassian.net';

  var lastSyncProp = loadLastSyncFromProps_();
  var meta = loadCacheMetaFromProps_();

  if (lastSyncProp) {
    var liteAll = loadIssuesLiteFromCache_(lastSyncProp);
    if (liteAll && liteAll.length !== undefined) {
      var filteredWarm = filterIssuesByTypes_(liteAll, types);
      return jsonOk_({
        issues: filteredWarm,
        metadata: {
          totalIssues: filteredWarm.length,
          issueTypes: uniqueTypes_(filteredWarm),
          lastSync: lastSyncProp,
          jiraInstance: (meta && meta.jiraInstance) || jiraInstanceFallback
        }
      });
    }
  }

  // Cold path: lite cache missing/expired, or LAST_SYNC property never written
  // (legacy projects deployed before April 2026). Read the Drive file once,
  // warm the lite cache + Properties so subsequent requests stay warm.
  var cache = loadCache();
  if (!cache) {
    return jsonOk_({
      issues: [],
      metadata: {
        totalIssues: 0,
        issueTypes: types,
        lastSync: null,
        jiraInstance: jiraInstanceFallback,
        needsInitialSync: true
      }
    });
  }

  var allIssues = cache.issues || [];
  var filtered = filterIssuesByTypes_(allIssues, types);
  var lightweight = filtered.map(toLightweightIssue_);

  try {
    refreshIssuesLiteCacheFromFullPayload_(cache);
  } catch (e) {
    Logger.log('handleIssues_: refreshIssuesLiteCacheFromFullPayload_ failed: ' + e.message);
  }
  try {
    persistLastSyncAndMeta_(cache);
  } catch (e2) {
    Logger.log('handleIssues_: persistLastSyncAndMeta_ failed: ' + e2.message);
  }

  return jsonOk_({
    issues: lightweight,
    metadata: {
      totalIssues: lightweight.length,
      issueTypes: uniqueTypes_(filtered),
      lastSync: cache.lastSync || null,
      jiraInstance: (cache.metadata && cache.metadata.jiraInstance) || jiraInstanceFallback
    }
  });
}

/**
 * Chunked lightweight issues in CacheService (100 KB/key max). Invalidated when lastSync changes.
 */
var LITE_CACHE_PREFIX_ = 'dashLite:';
var LITE_CACHE_CHUNK_ = 90000;
var LITE_CACHE_TTL_SEC_ = 21600;

function refreshIssuesLiteCacheFromFullPayload_(payload) {
  if (!payload || !payload.issues || !payload.lastSync) return;
  var lite = payload.issues.map(toLightweightIssue_);
  var json = JSON.stringify(lite);
  var cache = CacheService.getScriptCache();
  var n = Math.ceil(json.length / LITE_CACHE_CHUNK_);
  cache.put(LITE_CACHE_PREFIX_ + 'lastSync', String(payload.lastSync), LITE_CACHE_TTL_SEC_);
  cache.put(LITE_CACHE_PREFIX_ + 'n', String(n), LITE_CACHE_TTL_SEC_);
  for (var i = 0; i < n; i++) {
    cache.put(
      LITE_CACHE_PREFIX_ + i,
      json.substring(i * LITE_CACHE_CHUNK_, (i + 1) * LITE_CACHE_CHUNK_),
      LITE_CACHE_TTL_SEC_
    );
  }
  Logger.log('refreshIssuesLiteCacheFromFullPayload_: ' + n + ' chunk(s), ' + lite.length + ' issues');
}

function loadIssuesLiteFromCache_(expectedLastSync) {
  if (!expectedLastSync) return null;
  var cache = CacheService.getScriptCache();
  // Validate sync + chunk-count first with a single getAll round-trip, then
  // pull every chunk in a second batched getAll. Sequential cache.get(key)
  // calls were costing ~30-50 ms each (~30 chunks * 40 ms = ~1.2 s of pure
  // round-trip overhead) on warm requests.
  var meta = cache.getAll([LITE_CACHE_PREFIX_ + 'lastSync', LITE_CACHE_PREFIX_ + 'n']);
  var sync = meta[LITE_CACHE_PREFIX_ + 'lastSync'];
  var nStr = meta[LITE_CACHE_PREFIX_ + 'n'];
  if (!sync || String(sync) !== String(expectedLastSync)) return null;
  if (!nStr) return null;
  var n = parseInt(nStr, 10);
  if (!n || n > 400) return null;

  var keys = [];
  for (var i = 0; i < n; i++) keys.push(LITE_CACHE_PREFIX_ + i);
  var chunks = cache.getAll(keys);
  var parts = [];
  for (var j = 0; j < n; j++) {
    var p = chunks[LITE_CACHE_PREFIX_ + j];
    if (p == null) return null;
    parts.push(p);
  }
  try {
    return JSON.parse(parts.join(''));
  } catch (e) {
    Logger.log('loadIssuesLiteFromCache_: parse failed ' + e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Script Properties: tiny metadata blobs that let warm-path requests skip the
// Drive cache entirely. Updated on every successful sync (see performSync_).
// ---------------------------------------------------------------------------

var LAST_SYNC_PROP_KEY_ = 'DASHBOARD_LAST_SYNC';
var LAST_FULL_SYNC_PROP_KEY_ = 'DASHBOARD_LAST_FULL_SYNC';
var CACHE_META_PROP_KEY_ = 'DASHBOARD_CACHE_META';

// Defaults for the incremental-sync tuning knobs. Both are overridable via
// Script Properties without a redeploy:
//   FULL_SYNC_MAX_AGE_HOURS      — force a full sync when the last full sync
//                                   is older than this many hours (drift /
//                                   deletion safety net). Default: 24h.
//   INCREMENTAL_OVERLAP_MINUTES  — subtract this much from the requested
//                                   sinceIso before issuing the JQL, to absorb
//                                   JIRA indexing lag + clock skew. Default:
//                                   5 minutes.
var FULL_SYNC_MAX_AGE_MS_DEFAULT_ = 24 * 60 * 60 * 1000;
var INCREMENTAL_SAFETY_OVERLAP_MS_DEFAULT_ = 5 * 60 * 1000;

function getFullSyncMaxAgeMs_() {
  var raw = PropertiesService.getScriptProperties().getProperty('FULL_SYNC_MAX_AGE_HOURS');
  var hours = parseFloat(raw);
  if (!isFinite(hours) || hours < 0) return FULL_SYNC_MAX_AGE_MS_DEFAULT_;
  return hours * 60 * 60 * 1000;
}

function getIncrementalOverlapMs_() {
  var raw = PropertiesService.getScriptProperties().getProperty('INCREMENTAL_OVERLAP_MINUTES');
  var mins = parseFloat(raw);
  if (!isFinite(mins) || mins < 0) return INCREMENTAL_SAFETY_OVERLAP_MS_DEFAULT_;
  return mins * 60 * 1000;
}

/**
 * @param {{lastSync: string, issues: Array, metadata: Object}} cache
 *   Either a fresh sync payload or the parsed Drive cache.
 */
function persistLastSyncAndMeta_(cache) {
  if (!cache) return;
  var props = PropertiesService.getScriptProperties();
  if (cache.lastSync) {
    props.setProperty(LAST_SYNC_PROP_KEY_, String(cache.lastSync));
  }
  var counts = { Bug: 0, Story: 0, Test: 0, Other: 0 };
  if (cache.issues) {
    for (var i = 0; i < cache.issues.length; i++) {
      var t = cache.issues[i].issueType;
      if (t === 'Bug' || t === 'Story') counts[t]++;
      else if (t === 'Test' || t === 'Test Case') counts.Test++;
      else counts.Other++;
    }
  }
  var meta = {
    totalIssues: cache.issues ? cache.issues.length : 0,
    breakdown: counts,
    jiraInstance: (cache.metadata && cache.metadata.jiraInstance) ||
      props.getProperty('JIRA_DOMAIN') || 'hibob.atlassian.net',
    lastSync: cache.lastSync || null
  };
  props.setProperty(CACHE_META_PROP_KEY_, JSON.stringify(meta));
}

function loadLastSyncFromProps_() {
  return PropertiesService.getScriptProperties().getProperty(LAST_SYNC_PROP_KEY_) || null;
}

function loadCacheMetaFromProps_() {
  var raw = PropertiesService.getScriptProperties().getProperty(CACHE_META_PROP_KEY_);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * GET ?action=kpis — KPI bundle from PropertiesService (filled on sync), or
 * compute once from Drive cache if props are empty (cold / legacy project).
 */
/** GET ?action=kpis */
function handleKpis_() {
  var persisted = loadPersistedKpis_();
  if (persisted && persisted.stats) {
    return jsonOk_(persisted);
  }
  var cache = loadCache();
  if (!cache || !cache.issues) {
    return jsonOk_({ lastSync: null, stats: null });
  }
  var bugs = cache.issues.filter(function (i) { return i.issueType === 'Bug'; });
  return jsonOk_(computeDashboardKpisPayload_(bugs, cache.lastSync));
}

/**
 * GET ?action=sync&types=Bug,Story,Test[&mode=full|incremental]
 *
 * Pulls fresh data from JIRA and rewrites the Drive cache. Cooldown-gated.
 *
 * Sync-mode decision (added May 2026 for incremental sync):
 *   - mode=full                      -> force full sync
 *   - mode=incremental               -> force incremental (fallback to full
 *                                       only if there's no prior cache yet)
 *   - (no mode) + no prior lastSync  -> full
 *   - (no mode) + lastFullSync older than FULL_SYNC_MAX_AGE_HOURS
 *                                    -> full (drift / deletion safety net)
 *   - otherwise                      -> incremental (typical path)
 */
function handleSync_(params) {
  var cooldown = checkAndArmCooldown('sync');
  if (cooldown) {
    return jsonError_(429, 'Sync cooldown active', cooldown);
  }

  var types = parseTypes_(params.types);
  var requestedMode = (params.mode || '').toString().toLowerCase();

  var decision = decideSyncMode_(requestedMode);
  Logger.log('handleSync_: requested=' + (requestedMode || '(auto)') +
    ' -> ' + decision.mode + ' (' + decision.reason + ')');

  var result;
  if (decision.mode === 'incremental') {
    result = performIncrementalSync_(types, decision.sinceIso);
  } else {
    result = performFullSync_(types);
  }

  appendAccessLog('sync', {
    types: types,
    mode: result.syncType,
    reason: decision.reason,
    issuesProcessed: result.issuesProcessed,
    added: result.added,
    updated: result.updated,
    removed: result.removed
  });
  return jsonOk_(result);
}

/**
 * Pure helper so the policy is easy to unit-test / log. Returns:
 *   { mode: 'full' | 'incremental', sinceIso?: string, reason: string }
 */
function decideSyncMode_(requestedMode) {
  var lastSync = loadLastSyncFromProps_();
  var lastFullSync = PropertiesService.getScriptProperties()
    .getProperty(LAST_FULL_SYNC_PROP_KEY_);

  if (requestedMode === 'full') {
    return { mode: 'full', reason: 'requested=full' };
  }
  if (!lastSync) {
    return { mode: 'full', reason: 'no-prior-lastSync' };
  }
  if (!lastFullSync) {
    return { mode: 'full', reason: 'no-prior-fullSync' };
  }

  var fullAge = Date.now() - new Date(lastFullSync).getTime();
  var maxAge = getFullSyncMaxAgeMs_();
  if (requestedMode !== 'incremental' && isFinite(fullAge) && fullAge >= maxAge) {
    return {
      mode: 'full',
      reason: 'lastFullSync-age-' + Math.round(fullAge / 3600000) + 'h>=' +
        Math.round(maxAge / 3600000) + 'h'
    };
  }

  return {
    mode: 'incremental',
    sinceIso: lastSync,
    reason: requestedMode === 'incremental' ? 'requested=incremental' : 'auto'
  };
}

/**
 * Full sync: fetch every Bug/Story/Test matching the existing per-type
 * filters, replace the Drive cache, warm every downstream cache tier.
 *
 * Returns the same payloads that ?action=issues / ?action=kpis /
 * ?action=testing-coverage would return, so the dashboard can hydrate
 * directly from this single response and skip the follow-up round-trips.
 * That removes the post-Sync auto-reload latency (was ~12 s, now 0 s of
 * extra network).
 */
function performFullSync_(types) {
  var jira = buildJiraClient_();
  Logger.log('performFullSync_ -> JIRA fetch: ' + types.join(', '));
  var raw = jira.getAllIssues(types);
  Logger.log('performFullSync_ -> JIRA returned ' + raw.issues.length + ' issues, processing...');

  var processed = [];
  for (var i = 0; i < raw.issues.length; i++) {
    try {
      processed.push(processJiraIssue_(raw.issues[i]));
    } catch (e) {
      Logger.log('processJiraIssue_ failed for ' + (raw.issues[i] && raw.issues[i].key) +
        ': ' + e.message);
    }
  }

  // Recompute daysOpen uniformly so open issues don't accumulate drift across
  // future incremental syncs (which never touch unchanged entries).
  recomputeDaysOpenInPlace_(processed);

  var nowIso = new Date().toISOString();
  var payload = buildCachePayload_(processed, types, nowIso);
  saveCache(payload);
  warmAllCaches_(payload);

  PropertiesService.getScriptProperties().setProperty(LAST_FULL_SYNC_PROP_KEY_, nowIso);

  Logger.log('performFullSync_ -> cache saved (' + processed.length + ' issues)');
  return buildSyncResponse_(payload, 'full', {
    added: processed.length,
    updated: 0,
    removed: 0,
    reason: 'full'
  });
}

/**
 * Incremental sync: fetch only issues whose `updated` field has advanced
 * since lastSync, merge them into the existing cached issues array (upsert
 * on match, remove on scope-escape), then save + re-warm downstream caches.
 *
 * @param {string[]} types
 * @param {string}   sinceIso  timestamp to diff against (already validated)
 */
function performIncrementalSync_(types, sinceIso) {
  var existing = loadCache();
  if (!existing || !existing.issues || !existing.issues.length) {
    Logger.log('performIncrementalSync_: no existing cache, falling back to full sync');
    return performFullSync_(types);
  }

  var overlapMs = getIncrementalOverlapMs_();
  var jqlSinceIso = new Date(new Date(sinceIso).getTime() - overlapMs).toISOString();

  var jira = buildJiraClient_();
  Logger.log('performIncrementalSync_ -> JIRA fetch since ' + jqlSinceIso +
    ' (lastSync=' + sinceIso + ', overlap=' + (overlapMs / 60000) + 'min)');
  var raw = jira.getUpdatedIssues(types, jqlSinceIso);
  Logger.log('performIncrementalSync_ -> JIRA returned ' + raw.issues.length +
    ' changed issue(s), merging against ' + existing.issues.length + ' cached...');

  var mergeResult = mergeIncrementalIntoCache_(existing.issues, raw.issues);

  // Recompute daysOpen on the entire merged set so untouched entries stay
  // fresh (this is what keeps the "days open" column correct without a
  // full re-fetch).
  recomputeDaysOpenInPlace_(mergeResult.issues);

  var nowIso = new Date().toISOString();
  var jiraInstance = PropertiesService.getScriptProperties().getProperty('JIRA_DOMAIN') ||
    (existing.metadata && existing.metadata.jiraInstance) ||
    'hibob.atlassian.net';

  var payload = {
    issues: mergeResult.issues,
    metadata: {
      totalIssues: mergeResult.issues.length,
      issueTypes: types,
      jiraInstance: jiraInstance
    },
    lastSync: nowIso
  };

  // Skip the ~5 MB Drive write entirely when nothing actually changed — we
  // still bump DASHBOARD_LAST_SYNC so the next incremental starts from here.
  if (mergeResult.added === 0 && mergeResult.updated === 0 && mergeResult.removed === 0) {
    Logger.log('performIncrementalSync_: empty delta, skipping cache write');
    PropertiesService.getScriptProperties().setProperty(LAST_SYNC_PROP_KEY_, nowIso);
    // Rebuild the response payload against existing.lastSync so embedded
    // issues/kpis/tc remain consistent with what the dashboard cache has.
    payload.lastSync = existing.lastSync || nowIso;
    return buildSyncResponse_(payload, 'incremental', {
      added: 0,
      updated: 0,
      removed: 0,
      reason: 'empty-delta'
    });
  }

  saveCache(payload);
  warmAllCaches_(payload);

  Logger.log('performIncrementalSync_ -> cache saved (' + payload.issues.length +
    ' issues, +' + mergeResult.added + ' / ~' + mergeResult.updated +
    ' / -' + mergeResult.removed + ')');
  return buildSyncResponse_(payload, 'incremental', {
    added: mergeResult.added,
    updated: mergeResult.updated,
    removed: mergeResult.removed,
    reason: 'incremental'
  });
}

/**
 * Back-compat shim — older callers (Setup.runInitialSync, external snippets)
 * still call performSync_. Keep it pointing at full sync so there are no
 * surprises from behavioural drift.
 */
function performSync_(types) {
  return performFullSync_(types);
}

/**
 * Assemble the shape the Drive file / warm-paths all expect. Kept in one
 * place so full and incremental sync stay byte-identical.
 */
function buildCachePayload_(processedIssues, types, nowIso) {
  var jiraInstance = PropertiesService.getScriptProperties().getProperty('JIRA_DOMAIN') ||
    'hibob.atlassian.net';
  return {
    issues: processedIssues,
    metadata: {
      totalIssues: processedIssues.length,
      issueTypes: types,
      jiraInstance: jiraInstance
    },
    lastSync: nowIso
  };
}

/**
 * Refresh every downstream warm cache from the freshly-saved payload so the
 * next ?action=issues / ?action=kpis / ?action=testing-coverage request
 * skips the 5 MB Drive read.
 */
function warmAllCaches_(payload) {
  var processed = payload.issues || [];
  var bugsForKpi = [];
  for (var bi = 0; bi < processed.length; bi++) {
    if (processed[bi].issueType === 'Bug') bugsForKpi.push(processed[bi]);
  }
  try { persistDashboardKpis_(bugsForKpi, payload.lastSync); }
  catch (e0) { Logger.log('warmAllCaches_: persistDashboardKpis_ failed: ' + e0.message); }
  try { persistLastSyncAndMeta_(payload); }
  catch (e1) { Logger.log('warmAllCaches_: persistLastSyncAndMeta_ failed: ' + e1.message); }
  try { persistTestingCoveragePayload_(processed, payload.lastSync); }
  catch (e2) { Logger.log('warmAllCaches_: persistTestingCoveragePayload_ failed: ' + e2.message); }
}

/**
 * Build the fat sync response (issues + metadata + kpis + testingCoverage)
 * the dashboard hydrates from. Shared by full and incremental paths.
 */
function buildSyncResponse_(payload, syncType, counts) {
  var processed = payload.issues || [];
  var jiraInstance = (payload.metadata && payload.metadata.jiraInstance) ||
    PropertiesService.getScriptProperties().getProperty('JIRA_DOMAIN') ||
    'hibob.atlassian.net';

  var bugsForKpi = [];
  for (var bi = 0; bi < processed.length; bi++) {
    if (processed[bi].issueType === 'Bug') bugsForKpi.push(processed[bi]);
  }

  var lightweightIssues = processed.map(toLightweightIssue_);
  var kpiPayload = computeDashboardKpisPayload_(bugsForKpi, payload.lastSync);
  var testingCoveragePayload = computeTestingCoveragePayload_(processed, payload.lastSync, jiraInstance);

  return {
    success: true,
    syncType: syncType,
    reason: (counts && counts.reason) || null,
    issuesProcessed: processed.length,
    added: (counts && counts.added) || 0,
    updated: (counts && counts.updated) || 0,
    removed: (counts && counts.removed) || 0,
    lastSync: payload.lastSync,
    issues: lightweightIssues,
    metadata: {
      totalIssues: lightweightIssues.length,
      issueTypes: uniqueTypes_(processed),
      lastSync: payload.lastSync,
      jiraInstance: jiraInstance
    },
    kpis: kpiPayload,
    testingCoverage: testingCoveragePayload
  };
}

/**
 * GET ?action=testing-coverage
 * Same filter rules as api/bug-api-server.js handleTestingCoverage:
 *   - issueType === 'Story'
 *   - storyPoints >= 0.5
 *   - leadingTeam in MIS - GTM/GTC/CORP/Platform
 *   - status NOT in Canceled/Reject/Rejected
 *
 * Warm-path strategy: identical to handleIssues_. The post-sync hook in
 * performSync_ pre-computes the entire response payload and stuffs it into
 * the chunked tcLite: cache (see TestingCoverageCompute.gs). We try that
 * first and only fall back to the 5 MB Drive read on cold start.
 */
function handleTestingCoverage_() {
  var lastSyncProp = loadLastSyncFromProps_();
  if (lastSyncProp) {
    var precomputed = loadTestingCoveragePayload_(lastSyncProp);
    if (precomputed) {
      // Refresh the timestamp so clients can tell when the response was
      // produced vs. when the underlying data was synced.
      precomputed.metadata = precomputed.metadata || {};
      precomputed.metadata.timestamp = new Date().toISOString();
      return jsonOk_(precomputed);
    }
  }

  // Cold path: lite cache missing/expired, or LAST_SYNC property never written.
  var cache = loadCache();
  if (!cache || !cache.issues) {
    return jsonOk_({
      stories: [],
      total: 0,
      metadata: {
        error: 'No cached data available',
        suggestion: 'Run sync (action=sync) first',
        timestamp: new Date().toISOString()
      }
    });
  }

  var jiraInstance = (cache.metadata && cache.metadata.jiraInstance) ||
    PropertiesService.getScriptProperties().getProperty('JIRA_DOMAIN') ||
    'hibob.atlassian.net';
  var payload = computeTestingCoveragePayload_(cache.issues, cache.lastSync, jiraInstance);

  // Warm both Properties + the testing-coverage cache so the next request takes
  // the fast path. We persistLastSyncAndMeta_ defensively in case handleIssues_
  // hasn't run yet (page-load order is not guaranteed).
  try {
    persistLastSyncAndMeta_(cache);
  } catch (e1) {
    Logger.log('handleTestingCoverage_: persistLastSyncAndMeta_ failed: ' + e1.message);
  }
  try {
    persistTestingCoveragePayload_(cache.issues, cache.lastSync);
  } catch (e2) {
    Logger.log('handleTestingCoverage_: persistTestingCoveragePayload_ failed: ' + e2.message);
  }

  return jsonOk_(payload);
}

function handleHealth_() {
  var props = PropertiesService.getScriptProperties();
  var jiraConfigured = !!(props.getProperty('JIRA_DOMAIN') &&
    props.getProperty('JIRA_EMAIL') &&
    props.getProperty('JIRA_API_TOKEN'));

  // Prefer the small persisted CACHE_META blob (~150 bytes from
  // PropertiesService) over getCacheMetadata() which would load the full 5 MB
  // Drive cache and parse it. Only fall back to Drive on cold start, and
  // persist whatever we read so the next /health call stays fast.
  var meta = loadCacheMetaFromProps_();
  if (!meta) {
    try {
      var fullCache = loadCache();
      if (fullCache) {
        try { persistLastSyncAndMeta_(fullCache); } catch (_e) {}
        meta = loadCacheMetaFromProps_() || getCacheMetadata();
      }
    } catch (e) {
      Logger.log('handleHealth_ cold-path warm-up failed: ' + e.message);
    }
  }

  return jsonOk_({
    status: 'healthy',
    runtime: 'apps-script',
    jiraConfigured: jiraConfigured,
    cache: meta || { totalIssues: 0, breakdown: { Bug: 0, Story: 0, Test: 0 }, lastSync: null },
    cooldownSeconds: getCooldownSeconds_(),
    shareTokenEnforced: !!props.getProperty('SHARE_TOKEN')
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTypes_(raw) {
  if (!raw) return ['Bug', 'Story', 'Test'];
  return String(raw).split(',').map(function (t) { return t.trim(); }).filter(Boolean);
}

function filterIssuesByTypes_(issues, types) {
  return issues.filter(function (issue) {
    if (!issue || !issue.issueType) return false;
    if (types.indexOf('Bug') !== -1 && issue.issueType === 'Bug') return true;
    if (types.indexOf('Story') !== -1 && issue.issueType === 'Story') return true;
    if (types.indexOf('Test') !== -1 &&
      (issue.issueType === 'Test' || issue.issueType === 'Test Case')) return true;
    return false;
  });
}

function uniqueTypes_(issues) {
  var seen = {};
  var out = [];
  for (var i = 0; i < issues.length; i++) {
    var t = issues[i].issueType;
    if (t && !seen[t]) { seen[t] = true; out.push(t); }
  }
  return out;
}

/**
 * Public-safe lightweight projection. Mirrors api/bug-api-server.js
 * toLightweightIssue() and explicitly omits description/comments/changelog
 * because the web app can be hit by anyone with the link.
 */
function toLightweightIssue_(issue) {
  var base = {
    id: issue.key,
    key: issue.key,
    project: issue.project,
    summary: issue.summary,
    status: issue.status,
    priority: issue.priority,
    assignee: issue.assignee,
    reporter: issue.reporter,
    created: issue.created,
    updated: issue.updated,
    createdDate: issue.createdDate,
    updatedDate: issue.updatedDate,
    resolutionDate: issue.resolutionDate,
    resolutionDateFormatted: issue.resolutionDateFormatted,
    resolutiondate: issue.resolutiondate,
    daysOpen: issue.daysOpen,

    leadingTeam: issue.leadingTeam,
    system: issue.system,
    sprintName: issue.sprintName,
    sprint: issue.sprintName,
    components: issue.components,
    labels: issue.labels,

    issueType: issue.issueType || 'Bug'
  };

  if (Array.isArray(issue.allSprints) && issue.allSprints.length > 0) {
    base.allSprints = issue.allSprints;
  }

  if (issue.issueType === 'Bug' || !issue.issueType) {
    base.regression = issue.regression;
    base.severity = issue.severity;
    base.bugType = issue.bugType;
    base.classification = issue.classification || 'N/A';
    base.businessProcessClassification = issue.businessProcessClassification || 'N/A';
  } else if (issue.issueType === 'Story') {
    base.storyPoints = issue.storyPoints || 0;
    base.epicLink = issue.epicLink;
    base.testCaseCreated = issue.testCaseCreated;
    base.fixDuration = issue.fixDuration || null;
  } else if (issue.issueType === 'Test' || issue.issueType === 'Test Case') {
    base.generatedFromAI = issue.generatedFromAI;
    base.aiGeneratedTestCases = issue.aiGeneratedTestCases;
    base.testType = issue.testType;
  }

  return base;
}

/**
 * Soft access gate. When SHARE_TOKEN is configured every data endpoint must
 * be called with ?t=<token>. The dashboard HTML reads the token from its own
 * URL and forwards it automatically (see Index.html bootstrap).
 *
 * @return {GoogleAppsScript.Content.TextOutput | null}
 *         null when the request is allowed, otherwise an error response.
 */
function checkShareToken_(params) {
  var expected = PropertiesService.getScriptProperties().getProperty('SHARE_TOKEN');
  if (!expected) return null;
  var provided = params.t || params.token;
  if (provided && String(provided) === String(expected)) return null;
  return jsonError_(401, 'Missing or invalid share token', null);
}

function jsonOk_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError_(status, message, details) {
  var body = { error: message, status: status };
  if (details) body.details = details;
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
