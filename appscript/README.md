# Apps Script Web App — Multi-Issue Dashboard

This directory hosts the Google Apps Script project that mirrors the local
`api/bug-api-server.js` + `dashboard-multi-issue.html` stack so the dashboard
can be shared with management without anyone running a local server.

The script ID is bound in [.clasp.json](.clasp.json) and points to:
`1fWJbC8aqwqxVrt8HVn_upmUuNYNFn7332XwELTJg0Ype9iry5D6JlYVe`

## Files

- `Code.gs` — `doGet(e)` router, sync orchestrator, public action handlers.
- `JiraClient.gs` — JIRA REST client built on `UrlFetchApp` (port of `api/jira-bugs.js`).
- `FieldExtractors.gs` — field extraction logic (port of `api/jira-field-mappings.js`,
  preserving the April 2026 fixes for sprint, testCaseCreated and storyPoints).
- `Storage.gs` — Drive-backed JSON cache (`loadCache`/`saveCache`).
- `RateLimit.gs` — per-action cooldown using `CacheService`.
- `Setup.gs` — one-time `setup()` to create the Drive cache file.
- `Index.html` — the dashboard HTML, generated from
  `../dashboard-multi-issue.html` by `../appscript/build.js`.
- `appsscript.json` — manifest (scopes + web-app config).

## See also

- Plan: see the project plan for design rationale.
- Setup procedure: [docs/system/APPS_SCRIPT_DEPLOYMENT.md](../docs/system/APPS_SCRIPT_DEPLOYMENT.md).
