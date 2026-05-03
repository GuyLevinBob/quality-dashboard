#!/usr/bin/env node
/**
 * appscript/test-incremental.js
 * -----------------------------------------------------------------------------
 * Unit-test the incremental-sync merge primitives from MergeIssues.gs by
 * loading the Apps Script source into an isolated vm sandbox (same pattern
 * as test-parity.js / test-shape.js) and feeding it JIRA-shaped fixtures.
 *
 * Covers:
 *   1. Upsert: existing issue updated in place (counts as updated).
 *   2. Insert: new issue is added.
 *   3. Corrupt fetched entries (missing fields) -> skipped, don't crash.
 *   4. recomputeDaysOpenInPlace_ refreshes every entry relative to "now".
 *   5. issueMatchesFilter_ returns the right verdict for each type (the
 *      helper itself is retained for future use even though the merge no
 *      longer calls it — incremental JQL now applies the scope filter
 *      server-side).
 *
 * Exits 0 on success, 1 on any failure (CI-friendly).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------------------
// 1. Load the Apps Script sources into a shared sandbox so the merge helper
//    can resolve processJiraIssue_ / issueMatchesFilter_ / FIELD_EXTRACTORS.
// ---------------------------------------------------------------------------
const APPSCRIPT_DIR = __dirname;
const sandbox = {
  Array: Array,
  Date: Date,
  Math: Math,
  Object: Object,
  String: String,
  JSON: JSON,
  parseFloat: parseFloat,
  parseInt: parseInt,
  isNaN: isNaN,
  isFinite: isFinite,
  // Logger is referenced defensively in MergeIssues.gs; provide a silent
  // stub so the sandbox stays tidy.
  Logger: { log: function () {} }
};
vm.createContext(sandbox);

['FieldExtractors.gs', 'JiraClient.gs', 'MergeIssues.gs'].forEach((file) => {
  const src = fs.readFileSync(path.join(APPSCRIPT_DIR, file), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'appscript/' + file });
});

const {
  mergeIncrementalIntoCache_,
  recomputeDaysOpenInPlace_,
  issueMatchesFilter_
} = sandbox;

if (!mergeIncrementalIntoCache_ || !recomputeDaysOpenInPlace_ || !issueMatchesFilter_) {
  console.error('FAIL: required helpers not exposed by MergeIssues.gs / JiraClient.gs');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Fixture builders.
// ---------------------------------------------------------------------------

// Shape a raw JIRA issue the way processJiraIssue_ / issueMatchesFilter_ expect.
function rawJiraIssue(overrides) {
  const base = {
    key: 'BT-1',
    fields: {
      summary: 'Seeded fixture',
      issuetype: { name: 'Bug' },
      status: { name: 'In Progress' },
      priority: { name: 'Medium' },
      assignee: { displayName: 'Jane Doe' },
      reporter: { displayName: 'John Doe' },
      created: '2026-04-01T10:00:00.000Z',
      updated: '2026-05-03T09:00:00.000Z',
      components: [],
      labels: [],
      customfield_10020: null,      // Sprint
      customfield_10574: null,      // Leading Team
      customfield_10107: null,      // System
      customfield_10106: null,      // Regression
      customfield_10104: null,      // Severity
      customfield_10578: { value: 'Production' }, // Bug Type
      customfield_10032: null,      // Story Points
      customfield_10014: null,      // Epic Link
      customfield_11391: null,      // Test Case Created
      customfield_11392: null,      // AI Generated Test Cases
      customfield_11426: null       // Test Type
    }
  };
  const overridden = Object.assign({}, base, overrides || {});
  if (overrides && overrides.fields) {
    overridden.fields = Object.assign({}, base.fields, overrides.fields);
  }
  return overridden;
}

// Shape a PROCESSED cache entry (what processJiraIssue_ would output).
function cachedIssue(overrides) {
  const base = {
    key: 'BT-1',
    project: 'BT',
    summary: 'Cached fixture',
    status: 'In Progress',
    priority: 'Medium',
    assignee: 'Jane Doe',
    reporter: 'John Doe',
    created: '2026-04-01T10:00:00.000Z',
    updated: '2026-05-01T09:00:00.000Z',
    daysOpen: 32,
    issueType: 'Bug',
    leadingTeam: null,
    system: null,
    components: [],
    labels: [],
    sprintName: null,
    sprint: null,
    regression: null,
    severity: null,
    bugType: 'Production'
  };
  return Object.assign(base, overrides || {});
}

// ---------------------------------------------------------------------------
// 3. Tiny assertion runner.
// ---------------------------------------------------------------------------
let pass = 0;
let fail = 0;
const failures = [];

function t(label, fn) {
  try {
    fn();
    pass++;
    console.log('  ✓ ' + label);
  } catch (e) {
    fail++;
    failures.push({ label: label, message: e.message, stack: e.stack });
    console.log('  ✗ ' + label + ' — ' + e.message);
  }
}

function assertEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error((msg || 'mismatch') +
      ' — expected ' + JSON.stringify(expected) +
      ', got ' + JSON.stringify(actual));
  }
}

// ===========================================================================
// 4. Tests: issueMatchesFilter_
// ===========================================================================
console.log('\nissueMatchesFilter_');

t('Production Bug matches', () => {
  assertEqual(issueMatchesFilter_(rawJiraIssue({
    fields: { issuetype: { name: 'Bug' }, customfield_10578: { value: 'Production' } }
  })), true);
});

t('Non-Production Bug does NOT match', () => {
  assertEqual(issueMatchesFilter_(rawJiraIssue({
    fields: { issuetype: { name: 'Bug' }, customfield_10578: { value: 'Internal' } }
  })), false);
});

t('In-Progress Story matches', () => {
  assertEqual(issueMatchesFilter_(rawJiraIssue({
    fields: { issuetype: { name: 'Story' }, status: { name: 'In Progress' } }
  })), true);
});

t('Cancelled Story does NOT match', () => {
  assertEqual(issueMatchesFilter_(rawJiraIssue({
    fields: { issuetype: { name: 'Story' }, status: { name: 'Cancelled' } }
  })), false);
});

t('Canceled (single-L) Story does NOT match (JIRA spelling)', () => {
  assertEqual(issueMatchesFilter_(rawJiraIssue({
    fields: { issuetype: { name: 'Story' }, status: { name: 'Canceled' } }
  })), false);
});

t('Rejected Test Case does NOT match', () => {
  assertEqual(issueMatchesFilter_(rawJiraIssue({
    fields: { issuetype: { name: 'Test Case' }, status: { name: 'Rejected' } }
  })), false);
});

t('Open Test Case matches', () => {
  assertEqual(issueMatchesFilter_(rawJiraIssue({
    fields: { issuetype: { name: 'Test Case' }, status: { name: 'Open' } }
  })), true);
});

t('Unknown issue type does NOT match', () => {
  assertEqual(issueMatchesFilter_(rawJiraIssue({
    fields: { issuetype: { name: 'Epic' } }
  })), false);
});

t('Null / missing rawIssue does not crash', () => {
  assertEqual(issueMatchesFilter_(null), false);
  assertEqual(issueMatchesFilter_({}), false);
  assertEqual(issueMatchesFilter_({ fields: null }), false);
});

// ===========================================================================
// 5. Tests: mergeIncrementalIntoCache_
// ===========================================================================
console.log('\nmergeIncrementalIntoCache_');

t('empty fetched preserves existing cache untouched', () => {
  const existing = [cachedIssue({ key: 'BT-1' }), cachedIssue({ key: 'BT-2' })];
  const r = mergeIncrementalIntoCache_(existing, []);
  assertEqual(r.added, 0, 'added');
  assertEqual(r.updated, 0, 'updated');
  assertEqual(r.removed, 0, 'removed');
  assertEqual(r.issues.length, 2, 'length');
  assertEqual(r.issues[0].key, 'BT-1');
  assertEqual(r.issues[1].key, 'BT-2');
});

t('insert: new Production Bug is added', () => {
  const existing = [cachedIssue({ key: 'BT-1' })];
  const fetched = [rawJiraIssue({ key: 'BT-99', fields: { summary: 'new bug' } })];
  const r = mergeIncrementalIntoCache_(existing, fetched);
  assertEqual(r.added, 1);
  assertEqual(r.updated, 0);
  assertEqual(r.removed, 0);
  assertEqual(r.issues.length, 2);
  assertEqual(r.issues[1].key, 'BT-99');
});

t('upsert: existing Bug updated in place (order preserved)', () => {
  const existing = [
    cachedIssue({ key: 'BT-1', summary: 'old' }),
    cachedIssue({ key: 'BT-2', summary: 'other' })
  ];
  const fetched = [rawJiraIssue({ key: 'BT-1', fields: { summary: 'new summary' } })];
  const r = mergeIncrementalIntoCache_(existing, fetched);
  assertEqual(r.added, 0);
  assertEqual(r.updated, 1);
  assertEqual(r.removed, 0);
  assertEqual(r.issues.length, 2);
  assertEqual(r.issues[0].key, 'BT-1', 'order preserved');
  assertEqual(r.issues[0].summary, 'new summary', 'summary replaced');
});

t('merge is upsert-only: scope escapes are NOT removed (relies on full sync)', () => {
  // Safety net: if the server-side JQL ever lets a scope-escape through,
  // the merge must still upsert (not blindly delete) so we don't lose
  // visibility on issues that JIRA still considers in scope. Removal of
  // genuine scope-escapes is deferred to the daily auto-full-sync.
  const existing = [cachedIssue({ key: 'BT-1' }), cachedIssue({ key: 'BT-2' })];
  const fetched = [rawJiraIssue({
    key: 'BT-1',
    fields: { issuetype: { name: 'Bug' }, customfield_10578: { value: 'Internal' } }
  })];
  const r = mergeIncrementalIntoCache_(existing, fetched);
  assertEqual(r.added, 0);
  assertEqual(r.updated, 1);
  assertEqual(r.removed, 0);
  assertEqual(r.issues.length, 2, 'length preserved — no deletions');
});

t('corrupt fetched entries (no key / null) are skipped', () => {
  const existing = [cachedIssue({ key: 'BT-1' })];
  const fetched = [null, { key: null }, rawJiraIssue({ key: 'BT-OK' })];
  const r = mergeIncrementalIntoCache_(existing, fetched);
  assertEqual(r.added, 1);
  assertEqual(r.updated, 0);
  assertEqual(r.removed, 0);
  assertEqual(r.issues.length, 2);
});

t('combined delta: +add, ~update (no removals in incremental)', () => {
  const existing = [
    cachedIssue({ key: 'BT-1', issueType: 'Story' }),
    cachedIssue({ key: 'BT-2', summary: 'old' }),
    cachedIssue({ key: 'BT-3' })
  ];
  const fetched = [
    rawJiraIssue({ key: 'BT-2', fields: { summary: 'new' } }),
    rawJiraIssue({ key: 'BT-42', fields: { summary: 'fresh' } })
  ];
  const r = mergeIncrementalIntoCache_(existing, fetched);
  assertEqual(r.added, 1);
  assertEqual(r.updated, 1);
  assertEqual(r.removed, 0);
  assertEqual(r.issues.map((i) => i.key), ['BT-1', 'BT-2', 'BT-3', 'BT-42']);
  assertEqual(r.issues[1].summary, 'new');
});

t('rawProcessed counts every fetched entry with a key', () => {
  const existing = [];
  const fetched = [
    rawJiraIssue({ key: 'BT-A' }),
    rawJiraIssue({ key: 'BT-B' }),
    null,
    { key: null }
  ];
  const r = mergeIncrementalIntoCache_(existing, fetched);
  assertEqual(r.rawProcessed, 2, 'only entries with keys are counted');
});

// ===========================================================================
// 6. Tests: recomputeDaysOpenInPlace_
// ===========================================================================
console.log('\nrecomputeDaysOpenInPlace_');

t('recomputes relative to now (>= 1 day for created 5 days ago)', () => {
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
  const list = [{ key: 'BT-1', created: fiveDaysAgo, daysOpen: 999 }];
  recomputeDaysOpenInPlace_(list);
  if (list[0].daysOpen < 5 || list[0].daysOpen > 6) {
    throw new Error('expected ~5 days, got ' + list[0].daysOpen);
  }
});

t('missing created leaves daysOpen untouched', () => {
  const list = [{ key: 'BT-1', daysOpen: 42 }];
  recomputeDaysOpenInPlace_(list);
  assertEqual(list[0].daysOpen, 42);
});

t('invalid created does not crash or NaN the field', () => {
  const list = [{ key: 'BT-1', created: 'not-a-date', daysOpen: 42 }];
  recomputeDaysOpenInPlace_(list);
  assertEqual(list[0].daysOpen, 42);
});

t('empty / null input is a no-op', () => {
  recomputeDaysOpenInPlace_([]);
  recomputeDaysOpenInPlace_(null);
  recomputeDaysOpenInPlace_(undefined);
  pass--; // adjusted — test is absence of throw
  pass++;
});

// ===========================================================================
// 7. Summary
// ===========================================================================
console.log('\n-----------------------------------');
console.log('PASS: ' + pass + '  FAIL: ' + fail);
if (fail > 0) {
  failures.forEach((f) => {
    console.error('\nFAIL ' + f.label);
    console.error('  ' + f.message);
  });
  process.exit(1);
} else {
  console.log('All incremental-sync merge checks passed.');
  process.exit(0);
}
