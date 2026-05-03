#!/usr/bin/env node
/**
 * appscript/test-shape.js
 * -----------------------------------------------------------------------------
 * Verifies that toLightweightIssue_ (the public projection used by the
 * Apps Script ?action=issues endpoint) yields the same field set as the local
 * Node API's toLightweightIssue() for issues that already exist in
 * data/cache/issues-cache.json. This catches accidental field drops in the
 * port without requiring an actual JIRA call.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 1. Load the Node lightweight projection.
const apiSource = fs.readFileSync(path.resolve(__dirname, '..', 'api', 'bug-api-server.js'), 'utf8');
// Crude but robust: extract toLightweightIssue from the class body.
const nodeMatch = apiSource.match(/toLightweightIssue\(issue\) \{[\s\S]*?\n {4}\}/);
if (!nodeMatch) {
  console.error('FAIL: could not locate toLightweightIssue() in bug-api-server.js');
  process.exit(1);
}
const nodeFn = new Function(
  'issue',
  nodeMatch[0]
    .replace(/^\s*toLightweightIssue\(issue\)\s*\{/, '')
    .replace(/\}\s*$/, '')
);

// 2. Load the Apps Script projection from Code.gs into an isolated VM.
const gsSource = fs.readFileSync(path.resolve(__dirname, 'Code.gs'), 'utf8');
// Stub Apps Script-only globals the function does not actually use during
// projection, plus dummy implementations for the safety guard checks.
const sandbox = {
  Array: Array,
  Date: Date,
  parseFloat: parseFloat,
  isNaN: isNaN,
  // The toLightweightIssue_ function is pure JS - no globals needed - but
  // the file references many globals at parse time, so stub them.
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  ScriptApp: { getService: () => ({ getUrl: () => '' }) },
  HtmlService: { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => ({ setXFrameOptionsMode: () => ({ setSandboxMode: () => ({}) }), setSandboxMode: () => ({}) }) }) }), XFrameOptionsMode: { ALLOWALL: 1 }, SandboxMode: { IFRAME: 1 } },
  ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: { JSON: 'application/json' } },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => null }) },
  DriveApp: {},
  UrlFetchApp: {},
  Logger: { log: () => null },
  Utilities: { base64Encode: () => '' },
  // Stub the helpers that toLightweightIssue_ itself does not call.
  appendAccessLog: () => null,
  loadCache: () => null,
  saveCache: () => null,
  loadIssues: () => [],
  getCacheMetadata: () => null,
  checkAndArmCooldown: () => null,
  getCooldownSeconds_: () => 60,
  buildJiraClient_: () => null,
  processJiraIssue_: x => x,
  performSync_: () => null
};
vm.createContext(sandbox);
vm.runInContext(gsSource, sandbox, { filename: 'appscript/Code.gs' });
const gsFn = sandbox.toLightweightIssue_;
if (!gsFn) {
  console.error('FAIL: appscript/Code.gs did not expose toLightweightIssue_');
  process.exit(1);
}

// 3. Sample some real cached issues and compare field sets.
const cachePath = path.resolve(__dirname, '..', 'data', 'cache', 'issues-cache.json');
if (!fs.existsSync(cachePath)) {
  console.log('SKIP: ' + cachePath + ' not found - run a local sync first.');
  process.exit(0);
}
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
if (!cache.issues || !cache.issues.length) {
  console.log('SKIP: cache is empty.');
  process.exit(0);
}

// Pick one issue per type so we exercise every type-specific projection.
const samples = [];
['Bug', 'Story', 'Test', 'Test Case'].forEach(t => {
  const found = cache.issues.find(i => i.issueType === t);
  if (found) samples.push(found);
});
console.log('Sampling ' + samples.length + ' issues, one per available type.');

let fail = 0;
samples.forEach(issue => {
  const nodeOut = nodeFn(issue);
  const gsOut = gsFn(issue);

  const nodeKeys = Object.keys(nodeOut).sort();
  const gsKeys = Object.keys(gsOut).sort();

  const missingFromGs = nodeKeys.filter(k => !gsKeys.includes(k));
  const extraInGs = gsKeys.filter(k => !nodeKeys.includes(k));

  console.log('---------------------------------------------------');
  console.log(issue.key + ' (' + issue.issueType + ')');
  console.log('  node keys     : ' + nodeKeys.length);
  console.log('  appscript keys: ' + gsKeys.length);
  if (missingFromGs.length) {
    console.log('  MISSING in appscript: ' + missingFromGs.join(', '));
    fail++;
  }
  if (extraInGs.length) {
    // Extra fields in the Apps Script projection are fine — they would just
    // be additional safe data. But none should be heavy fields.
    const heavy = extraInGs.filter(k => /description|comments?|changelog/i.test(k));
    if (heavy.length) {
      console.log('  HEAVY FIELDS leaked: ' + heavy.join(', '));
      fail++;
    } else {
      console.log('  extra fields in appscript (ok): ' + extraInGs.join(', '));
    }
  }

  // Spot-check that every shared key has the same value.
  const shared = nodeKeys.filter(k => gsKeys.includes(k));
  let valueMismatches = 0;
  shared.forEach(k => {
    const nv = JSON.stringify(nodeOut[k]);
    const gv = JSON.stringify(gsOut[k]);
    if (nv !== gv) {
      valueMismatches++;
      if (valueMismatches <= 3) {
        console.log('  value diff on "' + k + '": node=' + nv + ' appscript=' + gv);
      }
    }
  });
  if (valueMismatches > 0) {
    console.log('  ' + valueMismatches + ' value mismatch(es) total.');
    fail++;
  }
});

console.log('---------------------------------------------------');
if (fail > 0) {
  console.log('FAIL: ' + fail + ' parity issue(s).');
  process.exit(1);
}
console.log('OK - Apps Script projection has same fields and values as Node.');
