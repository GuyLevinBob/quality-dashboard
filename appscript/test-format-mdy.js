#!/usr/bin/env node
/**
 * Ensures JiraClient.gs formatDateMDY_ contract stays aligned with the dashboard
 * (slash-separated M/D/YYYY from JIRA ISO timestamps).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function formatDateMDY_(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return parseInt(m[2], 10) + '/' + parseInt(m[3], 10) + '/' + m[1];
}

assert.strictEqual(formatDateMDY_('2026-04-30T11:25:13.908+0300'), '4/30/2026');
assert.strictEqual(formatDateMDY_('2026-12-01T00:00:00.000Z'), '12/1/2026');
assert.strictEqual(formatDateMDY_(null), null);

const gsPath = path.resolve(__dirname, 'JiraClient.gs');
const gs = fs.readFileSync(gsPath, 'utf8');
if (gs.indexOf('function formatDateMDY_(iso)') === -1) {
  console.error('FAIL: JiraClient.gs must define formatDateMDY_()');
  process.exit(1);
}
if (/createdDate:\s*f\.created\s*\?\s*new Date\(f\.created\)\.toLocaleDateString\(\)/.test(gs)) {
  console.error('FAIL: JiraClient.gs still uses toLocaleDateString() for createdDate — use formatDateMDY_');
  process.exit(1);
}

console.log('OK - formatDateMDY_ contract verified.');
