#!/usr/bin/env node
/**
 * appscript/test-parity.js
 * -----------------------------------------------------------------------------
 * Verifies that the Apps Script port of FIELD_EXTRACTORS produces identical
 * output to the Node original (api/jira-field-mappings.js) on a small set of
 * fixture inputs that exercise the April 2026 fixes:
 *
 *   - getSprintName       -> earliest sprint by startDate (unified for all types)
 *   - getTestCaseCreated  -> JIRA checkbox array format [{value: "Yes"}]
 *   - getStoryPoints      -> reads customfield_10032
 *   - getCustomFieldValue -> array / object / string / null shapes
 *
 * Usage: `node appscript/test-parity.js`
 *        Exits 0 on success, 1 on any divergence (suitable for CI).
 *
 * Implementation note: the .gs file is plain V8 JS using `var` globals. We
 * load it into an isolated `vm` context so its globals don't pollute Node's
 * process global, then read FIELD_EXTRACTORS off the context's sandbox.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// 1. Load the Node original.
const nodeMod = require(path.resolve(__dirname, '..', 'api', 'jira-field-mappings.js'));
const NODE_EXTRACTORS = nodeMod.FIELD_EXTRACTORS;

// 2. Load the Apps Script port into an isolated VM sandbox.
const gsSource = fs.readFileSync(path.resolve(__dirname, 'FieldExtractors.gs'), 'utf8');
const sandbox = { Array: Array, Date: Date, parseFloat: parseFloat, isNaN: isNaN };
vm.createContext(sandbox);
vm.runInContext(gsSource, sandbox, { filename: 'appscript/FieldExtractors.gs' });
const GS_EXTRACTORS = sandbox.FIELD_EXTRACTORS;

if (!GS_EXTRACTORS) {
  console.error('FAIL: appscript/FieldExtractors.gs did not expose FIELD_EXTRACTORS');
  process.exit(1);
}

// 3. Fixtures. Each row: [methodName, input, expected]. Where the Node and
// Apps Script implementations agree we use the same expected value.
const cases = [
  // -- getCustomFieldValue ---------------------------------------------------
  ['getCustomFieldValue', null, null],
  ['getCustomFieldValue', undefined, null],
  ['getCustomFieldValue', 'Production', 'Production'],
  ['getCustomFieldValue', { value: 'High' }, 'High'],
  ['getCustomFieldValue', [{ value: 'Yes' }], 'Yes'],
  ['getCustomFieldValue', ['MIS - CORP'], 'MIS - CORP'],
  ['getCustomFieldValue', [], null],

  // -- getTestCaseCreated (April 2026 fix: JIRA checkbox array) -------------
  ['getTestCaseCreated', null, 'No'],
  ['getTestCaseCreated', [], 'No'],
  ['getTestCaseCreated', [{ value: 'Yes', id: '11440' }], 'Yes'],
  ['getTestCaseCreated', [{ value: 'No' }], 'No'],
  ['getTestCaseCreated', ['Yes'], 'Yes'],
  ['getTestCaseCreated', { value: 'Yes' }, 'Yes'],
  ['getTestCaseCreated', 'Yes', 'Yes'],
  ['getTestCaseCreated', 'No', 'No'],

  // -- getStoryPoints (April 27 2026 fix: customfield_10032) ----------------
  ['getStoryPoints', null, 0],
  ['getStoryPoints', 0, 0],
  ['getStoryPoints', 1, 1],
  ['getStoryPoints', 2, 2],
  ['getStoryPoints', 0.5, 0.5],
  ['getStoryPoints', '3', 3],
  ['getStoryPoints', 'not a number', 0],

  // -- getStatusName / getIssueTypeName / getUserDisplayName ----------------
  ['getStatusName', null, null],
  ['getStatusName', { name: 'Done' }, 'Done'],
  ['getIssueTypeName', { name: 'Story' }, 'Story'],
  ['getIssueTypeName', { name: 'Test Case' }, 'Test Case'],
  ['getUserDisplayName', null, null],
  ['getUserDisplayName', { displayName: 'Rottem Wolf' }, 'Rottem Wolf'],
  ['getUserDisplayName', { name: 'rottem' }, 'rottem'],

  // -- getEpicLink ----------------------------------------------------------
  ['getEpicLink', null, null],
  ['getEpicLink', 'BT-13092', 'BT-13092'],
  ['getEpicLink', { key: 'BT-13092' }, 'BT-13092'],

  // -- getAIGeneratedTestCases (testType is the source of truth) -----------
  ['getAIGeneratedTestCases', [null, null], 'No'],
  ['getAIGeneratedTestCases', [null, { value: 'Yes' }], 'Yes'],
  ['getAIGeneratedTestCases', ['https://chatgpt.com/...', { value: 'No' }], 'No'],
  ['getAIGeneratedTestCases', ['https://chatgpt.com/...', { value: 'Yes' }], 'Yes']
];

// -- getSprintName: needs richer fixtures so build them separately ---------
const sprintCases = [
  // BT-12421-style: two sprints, take EARLIEST by startDate (April 2026 fix).
  [
    [
      { name: 'PI3.26.Sprint 1', startDate: '2026-03-30T07:00:00.000Z' },
      { name: 'PI2.26.Sprint 2 (9/3 - 30/3)', startDate: '2026-03-09T07:00:00.000Z' }
    ],
    'PI2.26.Sprint 2 (9/3 - 30/3)'
  ],
  // Single sprint
  [[{ name: 'PI3.26.Sprint 1 (30/3 -27/4) 2', startDate: '2026-03-30T07:00:00.000Z' }],
    'PI3.26.Sprint 1 (30/3 -27/4) 2'],
  // No startDate -> fallback to first
  [[{ name: 'Backlog' }], 'Backlog'],
  // Empty / null
  [null, null],
  [[], null]
];

let pass = 0;
let fail = 0;
const failures = [];

function assertEqual(method, input, gsOut, nodeOut, expected) {
  const ok =
    JSON.stringify(gsOut) === JSON.stringify(expected) &&
    JSON.stringify(nodeOut) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push({
      method: method,
      input: input,
      expected: expected,
      nodeOut: nodeOut,
      gsOut: gsOut
    });
  }
}

cases.forEach(function (row) {
  const [method, input, expected] = row;
  let gsOut, nodeOut;
  if (Array.isArray(input) && method === 'getAIGeneratedTestCases') {
    gsOut = GS_EXTRACTORS[method].apply(null, input);
    nodeOut = NODE_EXTRACTORS[method].apply(null, input);
  } else {
    gsOut = GS_EXTRACTORS[method](input);
    nodeOut = NODE_EXTRACTORS[method](input);
  }
  assertEqual(method, input, gsOut, nodeOut, expected);
});

sprintCases.forEach(function (row) {
  const [input, expected] = row;
  const gsOut = GS_EXTRACTORS.getSprintName(input);
  const nodeOut = NODE_EXTRACTORS.getSprintName(input);
  assertEqual('getSprintName', input, gsOut, nodeOut, expected);
});

var allSprintCases = [
  [
    [
      { name: 'PI3.26.Sprint 1', startDate: '2026-03-30T07:00:00.000Z' },
      { name: 'PI2.26.Sprint 2 (9/3 - 30/3)', startDate: '2026-03-09T07:00:00.000Z' }
    ],
    ['PI2.26.Sprint 2 (9/3 - 30/3)', 'PI3.26.Sprint 1']
  ],
  [
    [{ name: 'PI3.26.Sprint 1 (30/3 -27/4) 2', startDate: '2026-03-30T07:00:00.000Z' }],
    ['PI3.26.Sprint 1 (30/3 -27/4) 2']
  ],
  [[{ name: 'Backlog' }], ['Backlog']],
  [null, []],
  [[], []]
];

allSprintCases.forEach(function (row) {
  const [input, expected] = row;
  const gsOut = GS_EXTRACTORS.getAllSprintNames(input);
  const nodeOut = NODE_EXTRACTORS.getAllSprintNames(input);
  assertEqual('getAllSprintNames', input, gsOut, nodeOut, expected);
});

console.log('---------------------------------------------------');
console.log('FIELD_EXTRACTORS parity test');
console.log('---------------------------------------------------');
console.log('Total: ' + (pass + fail) + '   Pass: ' + pass + '   Fail: ' + fail);
if (fail > 0) {
  console.log('---------------------------------------------------');
  failures.forEach(function (f, i) {
    console.log('FAIL #' + (i + 1) + ': ' + f.method);
    console.log('  input    : ' + JSON.stringify(f.input));
    console.log('  expected : ' + JSON.stringify(f.expected));
    console.log('  node     : ' + JSON.stringify(f.nodeOut));
    console.log('  appscript: ' + JSON.stringify(f.gsOut));
  });
  process.exit(1);
}
console.log('OK - Apps Script port matches Node original on all fixtures.');
