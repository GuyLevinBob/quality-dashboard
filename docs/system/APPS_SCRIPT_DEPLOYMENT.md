# Apps Script Deployment Guide

This guide explains how to deploy and operate the Google Apps Script web app
that mirrors the local `api/bug-api-server.js` + `dashboard-multi-issue.html`
stack. Once deployed, the web app is **a single URL** that management opens to
view the dashboard, filter, and trigger an on-demand JIRA sync — without
running anything locally.

The internal pipeline (localhost:3002 + GitHub Pages static export) is **not
modified**. It remains the canonical internal/testing path and the failsafe.

> Apps Script project ID: `1fWJbC8aqwqxVrt8HVn_upmUuNYNFn7332XwELTJg0Ype9iry5D6JlYVe`

## Architecture summary

```
Internal (unchanged)                           Apps Script (new)
--------------------                           ------------------
dev browser  --> localhost:3002 --> JIRA       mgmt browser --> Apps Script web app --> JIRA
              -> data/cache/issues-cache.json                 -> Drive: hibob-dashboard-cache.json
```

Both pipelines share **only** the JIRA instance. Independent code,
independent caches, independent failure modes.

## Files

The Apps Script project is mirrored in [appscript/](../../appscript) in this
repo and pushed via [clasp](https://github.com/google/clasp).

| File                              | Role                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| `appscript/.clasp.json`           | Binds the local directory to the script ID                     |
| `appscript/appsscript.json`       | Manifest (scopes, web-app config)                              |
| `appscript/Code.gs`               | `doGet` router: `?action=issues\|kpis\|sync\|testing-coverage\|health` |
| `appscript/KpiCompute.gs`         | Server-side KPI bundle for `?action=kpis` + Script Properties |
| `appscript/JiraClient.gs`         | Paginated JIRA REST client (`UrlFetchApp`)                     |
| `appscript/FieldExtractors.gs`    | Field extraction (port of `api/jira-field-mappings.js`)        |
| `appscript/Storage.gs`            | Drive-backed JSON cache + access log                           |
| `appscript/RateLimit.gs`          | Sync cooldown via `CacheService`                               |
| `appscript/Setup.gs`              | One-time `setup()`, `verify()`, `runInitialSync()`             |
| `appscript/Index.html`            | **Generated** dashboard HTML (do not edit by hand)             |
| `appscript/build.js`              | Generates `Index.html` from `dashboard-multi-issue.html`       |

## Repository automation (CI-friendly)

From the repo root, after `npm install`:

| Command | Purpose |
| ------- | ------- |
| `npm run test-appscript` | Field-extractor + projection parity (must pass before push) |
| `npm run build-appscript` | Regenerate `appscript/Index.html` from `dashboard-multi-issue.html` |
| `npm run appscript-pull` | `npx clasp pull` from `appscript/` (requires `npx clasp login` first) |
| `npm run appscript-push` | Build + `npx clasp push` (requires login) |
| `npm run deploy-appscript` | Tests + build + push + `npx clasp deploy` (requires login) |

`@google/clasp` is a **devDependency** — use `npx clasp …` so you never need a global install.

## Who runs what: one-time vs routine deploy

**You (human) only have to do these once per machine / project:**

1. **`npx clasp login`** — opens a browser; creates `~/.clasprc.json` (OAuth). Without this, `clasp push` cannot authenticate.
2. **Script Properties** in the Apps Script editor — `JIRA_DOMAIN`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, optional `SHARE_TOKEN`, etc.
3. **First-time Drive cache:** run **`Setup.setup()`** once in the editor (creates `DRIVE_CACHE_FILE_ID`).
4. **(Optional)** First full population: **`Setup.runInitialSync()`** or the dashboard **Sync** button.

**After that, deploys are routine terminal work** (Cursor’s integrated terminal is fine — same as iTerm/Terminal):

```bash
cd /path/to/testcourse
npm run deploy-appscript
```

That runs parity tests, rebuilds `Index.html`, **`clasp push`**, and **`clasp deploy`**.

**Important — stable web app URL:** Plain `clasp deploy` creates a *new* deployment entry (new `AKfycb…` id) each time. To **keep the same exec URL** your users already bookmarked, update the existing deployment:

```bash
cd appscript
npx clasp deployments    # list deployments; copy the @AKfycb… id for your prod web app
npx clasp push
npx clasp deploy -i AKfycbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --description "what changed"
```

Replace the `-i` value with your **Web app** deployment id from the list (not the @HEAD **library** deployment).

## Endpoints

The web-app URL has the form `https://script.google.com/macros/s/<deployId>/exec`.

| URL                                         | Purpose                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `/exec`                                     | Renders the dashboard HTML                                         |
| `/exec?action=issues&types=Bug,Story,Test`  | Lightweight cached issues (descriptions/changelog stripped)        |
| `/exec?action=kpis`                         | KPI tile payload (Script Properties; fast path for dashboard)     |
| `/exec?action=sync&types=Bug,Story,Test`    | Full JIRA fetch + cache rewrite. Cooldown-gated (default 60 s)     |
| `/exec?action=testing-coverage`             | MIS-team stories with >=0.5 SP                                     |
| `/exec?action=health`                       | Health, last sync time, breakdown by issue type                    |

When `SHARE_TOKEN` is configured all `?action=*` calls also require `?t=<token>`.
The dashboard HTML reads the token from its own URL automatically, so the only
thing to share with management is `…/exec?t=<token>`.

## First-time setup

1. **Install clasp and sign in** (one-time per machine). Prefer `npx` so nothing
   is installed globally:

   ```bash
   npm install                    # installs @google/clasp from devDependencies
   npx clasp login                # opens a browser; sign in with the Google account that owns the script
   ```

   After you are done deploying for the day, you can run `npx clasp logout` to
   remove OAuth tokens from `~/.clasprc.json`.

2. **Verify linkage to the Apps Script project** (optional but recommended once):

   ```bash
   npm run appscript-pull
   ```

   or `cd appscript && npx clasp pull`.

   **Important:** If the remote project still has older files, `pull` may
   overwrite local `appscript/*.gs`. This repo is the **source of truth**:
   if your local files are newer, skip `pull` and go straight to step 4.

3. **Set Script Properties**. In the Apps Script editor open
   _Project Settings -> Script Properties -> Add script property_ and add:

   | Property                | Value                                     | Notes                                  |
   | ----------------------- | ----------------------------------------- | -------------------------------------- |
   | `JIRA_DOMAIN`           | `hibob.atlassian.net`                     |                                        |
   | `JIRA_EMAIL`            | the JIRA account email                    | Use a service account where possible   |
   | `JIRA_API_TOKEN`        | the JIRA API token                        | Never commit this. Rotate quarterly    |
   | `SHARE_TOKEN`           | random ~32-char string                    | Optional. Soft access gate             |
   | `SYNC_COOLDOWN_SECONDS` | `60`                                      | Optional. Defaults to 60 if unset      |

4. **Build and push the code**:

   ```bash
   npm run appscript-push
   ```

   or `npm run build-appscript && cd appscript && npx clasp push`.

5. **Run `Setup.setup()` once** from the Apps Script editor. This creates the
   Drive cache file `hibob-dashboard-cache.json` and writes its file ID to
   Script Properties as `DRIVE_CACHE_FILE_ID`. Re-running `setup()` is safe —
   it reuses the existing file ID.

6. **Run `Setup.runInitialSync()` once** from the editor to populate the
   cache. This takes ~60-90 s for ~6,100 issues. Watch the execution log to
   confirm completion.

7. **Run `Setup.verify()`** to print a status report (last sync, totals,
   share-token state).

8. **Deploy as Web App**:
   - _Deploy -> New deployment_
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (matches the chosen access posture)
   - Click _Deploy_, copy the resulting URL.

9. **Smoke test** the deployment URL:
   - `…/exec?action=health[&t=<token>]` — should return `status: "healthy"`
     with a recent `lastSync`.
   - `…/exec[?t=<token>]` — should render the dashboard.
   - Click the **Sync** button in the dashboard once; it should report success
     (or a 429 cooldown if you just ran `runInitialSync()`).

10. **Share with management**:
    - Copy the URL from step 8 (with `?t=<SHARE_TOKEN>` if configured).
    - Paste into the management distribution list / Slack channel.

## Updating the dashboard after code changes

Whenever `dashboard-multi-issue.html`, any `appscript/*.gs`, or `appsscript.json`
changes:

```bash
npm run build-appscript    # regenerates Index.html
cd appscript
npx clasp push
npx clasp deploy -i <your-web-app-deployment-id> --description "what changed"
```

Use `npx clasp deployments` to find `<your-web-app-deployment-id>` (the long `AKfycb…` string for your **Web app** row). Omitting `-i` creates an extra deployment and a **new** URL each time.

Or, all-in-one (creates a **new** deployment id every run — only if you want a fresh URL):

```bash
npm run deploy-appscript
```

The previous deployment URL keeps working because Apps Script versions web-app
deployments. Use the same deployment URL forever; updating the deployment
publishes a new version under that URL.

## Operations

### Re-syncing on demand

Three ways:

- Click **Sync** on the dashboard (the same button management uses).
- Hit `…/exec?action=sync&t=<token>` directly.
- Run `Setup.runInitialSync()` from the editor (no cooldown).

### Inspecting cache state

`/exec?action=health` returns:

```json
{
  "status": "healthy",
  "runtime": "apps-script",
  "jiraConfigured": true,
  "cache": {
    "totalIssues": 6161,
    "breakdown": { "Bug": 1234, "Story": 4500, "Test": 427 },
    "lastSync": "2026-04-30T08:33:15.604Z"
  },
  "cooldownSeconds": 60,
  "shareTokenEnforced": true
}
```

Or in the editor: `Setup.verify()`.

### Access log

`Storage.gs::appendAccessLog` writes an `access.log` file in the script owner's
Drive (file ID stored in `DRIVE_LOG_FILE_ID`). Each line is
`<iso-timestamp>\t<action>\t<json-detail-or-empty>`. The log is capped at
~200 KB to prevent unbounded growth.

### Rotating the share token

If the URL leaks:

1. Update `SHARE_TOKEN` in Script Properties to a new value.
2. Re-share the new URL with management.
3. Old links stop working immediately (no redeploy needed).

### Rotating the JIRA API token

1. Generate a new JIRA token.
2. Update `JIRA_API_TOKEN` in Script Properties.
3. Test with `?action=health` then `?action=sync`.

## Failsafe — what to do if Apps Script breaks

The local pipeline is unaffected and continues to work:

```bash
# Internal users (developer):
node api/bug-api-server.js   # in one terminal
npm run serve-multi          # in another  ->  http://127.0.0.1:8090
```

For management while the Apps Script is down:

- The GitHub Pages static export remains as a read-only fallback at
  `https://guylevinbob.github.io/quality-dashboard/dashboard-multi-issue.html`.
  This view does not have a working Sync button (by design — no public JIRA
  credentials live there) but always shows the most recent committed snapshot
  of `multi-dashboard-data.json`.

If the local Node.js pipeline breaks, the Apps Script web app continues to
serve management independently.

## Security — residual risk

Access posture is **"Anyone with the link"** (chosen during planning). Even
with all mitigations applied, anyone who learns the URL (and the share token,
when configured) can:

- See the dashboard
- See lightweight JIRA issue summaries (key, summary, status, assignee, sprint)
- Trigger a JIRA sync (rate-limited)

The following are **not** exposed:

- The JIRA API token (server-side only, in Script Properties)
- JIRA descriptions, comments, changelogs (stripped by `toLightweightIssue_`)
- Write access to JIRA (the web app never writes back)

To tighten further later, set `appscript/appsscript.json` `webapp.access` to
`DOMAIN` and redeploy — this restricts to the script owner's Google Workspace
domain, replacing the soft `SHARE_TOKEN` gate with proper SSO.

## Reference: Script Properties

| Property                | Required | Default                | Purpose                                         |
| ----------------------- | -------- | ---------------------- | ----------------------------------------------- |
| `JIRA_DOMAIN`           | yes      | —                      | JIRA instance hostname                          |
| `JIRA_EMAIL`            | yes      | —                      | JIRA account email for basic auth               |
| `JIRA_API_TOKEN`        | yes      | —                      | JIRA API token                                  |
| `DRIVE_CACHE_FILE_ID`   | auto     | (set by `setup()`)     | ID of the Drive cache file                      |
| `DRIVE_LOG_FILE_ID`     | auto     | (set on first log)     | ID of the access log file                       |
| `SHARE_TOKEN`           | optional | (none)                 | Required `?t=` value for data endpoints         |
| `SYNC_COOLDOWN_SECONDS` | optional | `60`                   | Min seconds between sync HTTP calls             |
| `CACHE_FILE_NAME`       | optional | `hibob-dashboard-cache.json` | Name of the Drive cache file              |

## Reference: parity testing

### Automated parity tests

Two Node-side tests verify that the Apps Script port stays equivalent to the
local Node implementation. They run without an Apps Script deployment.

```bash
npm run test-appscript
```

What they cover:

| Test                          | What it checks                                                        |
| ----------------------------- | --------------------------------------------------------------------- |
| `appscript/test-parity.js`    | `FIELD_EXTRACTORS` produce identical output to `api/jira-field-mappings.js` for 41 fixtures, including the April 2026 fixes for `getSprintName`, `getTestCaseCreated`, `getStoryPoints`. |
| `appscript/test-shape.js`     | The lightweight projection (`toLightweightIssue_`) has the same field set and values as the Node `toLightweightIssue()` for one Bug, one Story and one Test Case sampled from `data/cache/issues-cache.json`. Also fails if `description`/`comments`/`changelog` ever leak into the public projection. |

These tests are wired into `npm run deploy-appscript` so a divergence blocks
deployment.

Last run (`npm run test-appscript`) recorded:

- 41/41 extractor fixtures pass
- Bug: 25 keys, Story: 26 keys, Test Case: 25 keys, no heavy fields, no value mismatches

### Manual integration tests (after deploying)

These require the actual Apps Script deployment; run them once after every
material change.

| Test                | Procedure                                                                                                            | Pass criteria                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Health              | `curl '<deploy>/exec?action=health[&t=...]'`                                                                          | `status: "healthy"`, `jiraConfigured: true`                                                                |
| Initial sync        | Run `Setup.runInitialSync()` from the editor                                                                          | Logger reports `~6,100 issues, lastSync` ISO timestamp                                                      |
| HTTP sync           | Click **Sync** in the dashboard                                                                                       | Same KPIs as before, `lastSync` advances                                                                    |
| Cooldown            | Hit `?action=sync` twice within 60 s                                                                                 | First returns `{ success: true }`, second returns `429` with `retryAfterSeconds`                            |
| KPI parity          | Open Apps Script dashboard side by side with localhost dashboard                                                      | `Bugs This Month`, `Overall Testing Coverage`, MIS team breakdown match within a few-issue delta             |
| Filter parity       | Select Stories + MIS - CORP + a sprint                                                                               | Row counts match the localhost dashboard                                                                    |
| Heavy-field check   | `curl '<deploy>/exec?action=issues' \| python -c "import json,sys; d=json.load(sys.stdin); print('description' in d['issues'][0])"` | Prints `False` (description must not be exposed)                                                           |
| Failsafe            | Rename `doGet` to `_doGet` in Code.gs and redeploy                                                                    | Apps Script URL stops working; localhost + GitHub Pages keep working untouched. Restore `doGet` afterwards. |

### Reference issues and KPI targets

See [docs/system/MULTI_DASHBOARD_SYSTEM_DOCUMENTATION.md](MULTI_DASHBOARD_SYSTEM_DOCUMENTATION.md)
for canonical KPI targets.

Reference issues used during the April 2026 work:

- `BT-12421` — Test Case Created = Yes (validates `getTestCaseCreated`)
- `BT-12463` — Story Points = 2 (validates `getStoryPoints` against `customfield_10032`)
- `BT-13419` — Multi-issue sync sample
- Testing Coverage targets: ~866 eligible stories, ~15% coverage, team breakdown
  CORP 338 / GTC 309 / GTM 210 / Platform 9.
