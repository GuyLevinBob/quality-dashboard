/**
 * Incremental-sync merge primitives.
 *
 * Two pure functions:
 *   - mergeIncrementalIntoCache_(existingProcessedIssues, rawFetchedIssues)
 *       Upserts every fetched issue into the cache. The incremental JQL
 *       already applies the per-type scope filter server-side, so every
 *       returned issue is guaranteed in scope and is safe to upsert.
 *       Scope escapes (e.g., a bug retyped off Production, a story moved
 *       to Cancelled) do NOT come back through incremental — by design —
 *       and get reconciled on the next daily auto-full-sync.
 *   - recomputeDaysOpenInPlace_(processedIssues)
 *       Refreshes `daysOpen` on every entry so untouched open issues don't
 *       accumulate drift across incremental syncs.
 *
 * Kept in its own file so the Node `appscript/test-incremental.js` harness
 * can load it into a vm sandbox (alongside FieldExtractors.gs +
 * JiraClient.gs) and exercise the merge logic directly on JIRA-shaped
 * fixtures.
 *
 * Contract: operates on PROCESSED cache entries (the shape produced by
 * processJiraIssue_ and stored in the Drive cache). Fetched issues are RAW
 * JIRA `/rest/api/3/search/jql` responses, which we run through
 * processJiraIssue_ (defined in JiraClient.gs) before upserting.
 */

/**
 * @param {Array} existing    PROCESSED cache entries (cache.issues).
 * @param {Array} fetched     RAW JIRA issues returned by getUpdatedIssues.
 * @return {{
 *   issues: Array,      // merged, de-duped cache entries
 *   added: number,      // entries newly inserted
 *   updated: number,    // entries replaced in place
 *   removed: number,    // always 0 for incremental — kept for response shape parity
 *   rawProcessed: number // how many fetched entries we actually looked at
 * }}
 */
function mergeIncrementalIntoCache_(existing, fetched) {
  var byKey = {};
  var keyOrder = [];
  if (existing && existing.length) {
    for (var i = 0; i < existing.length; i++) {
      var e = existing[i];
      if (e && e.key) {
        if (!(e.key in byKey)) keyOrder.push(e.key);
        byKey[e.key] = e;
      }
    }
  }

  var added = 0;
  var updated = 0;
  var rawProcessed = 0;

  if (fetched && fetched.length) {
    for (var j = 0; j < fetched.length; j++) {
      var raw = fetched[j];
      if (!raw || !raw.key) continue;
      rawProcessed++;

      var key = raw.key;
      var wasPresent = (key in byKey);

      var processed;
      try {
        processed = processJiraIssue_(raw);
      } catch (e) {
        // Keep going so one bad issue doesn't abort the whole sync. Matches
        // the behaviour of performFullSync_ today.
        if (typeof Logger !== 'undefined' && Logger.log) {
          Logger.log('mergeIncrementalIntoCache_: processJiraIssue_ failed for ' +
            key + ': ' + e.message);
        }
        continue;
      }
      byKey[key] = processed;
      if (wasPresent) {
        updated++;
      } else {
        added++;
        keyOrder.push(key);
      }
    }
  }

  var mergedIssues = [];
  for (var k = 0; k < keyOrder.length; k++) {
    var existingKey = keyOrder[k];
    if (existingKey in byKey) mergedIssues.push(byKey[existingKey]);
  }

  return {
    issues: mergedIssues,
    added: added,
    updated: updated,
    removed: 0,
    rawProcessed: rawProcessed
  };
}

/**
 * Update `daysOpen` on every processed entry in-place, relative to "now".
 * Cheap O(n) pass — essential because incremental sync does not re-fetch
 * issues whose `updated` hasn't changed, so their cached `daysOpen` would
 * otherwise grow stale.
 *
 * Safe to call on both incremental-merged lists and full-sync lists (it's
 * idempotent).
 *
 * @param {Array} processedIssues
 */
function recomputeDaysOpenInPlace_(processedIssues) {
  if (!processedIssues || !processedIssues.length) return;
  var now = Date.now();
  for (var i = 0; i < processedIssues.length; i++) {
    var issue = processedIssues[i];
    if (!issue || !issue.created) continue;
    var created = new Date(issue.created).getTime();
    if (isNaN(created)) continue;
    issue.daysOpen = Math.ceil(Math.abs(now - created) / 86400000);
  }
}
