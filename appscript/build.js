#!/usr/bin/env node
/**
 * appscript/build.js
 * -----------------------------------------------------------------------------
 * Generate appscript/Index.html from ../dashboard-multi-issue.html so the same
 * source dashboard runs in three environments (local, GitHub Pages, Apps Script
 * web app) without code duplication.
 *
 * What this script does:
 *
 *   1. Read dashboard-multi-issue.html (the master).
 *   2. Inject a small Apps Script template scriptlet into <head>:
 *
 *        window.__APPSCRIPT_URL__   = '<?= ScriptApp.getService().getUrl() ?>';
 *        window.__APPSCRIPT_TOKEN__ = '<?= shareToken ?>';
 *
 *      The runtime adapter at the top of the dashboard's main <script> block
 *      reads these globals and switches its data source to the Apps Script
 *      web app.
 *
 *   3. Write the result to appscript/Index.html.
 *
 * Run: `npm run build-appscript`
 *
 * Note: Apps Script's HtmlService template scriptlets (`<?= ... ?>`) only run
 * when the file is rendered server-side via `HtmlService.createTemplateFromFile`.
 * Code.gs sets the template variables (appsScriptUrl, shareToken) before
 * calling .evaluate(); this build step just ensures Index.html declares the
 * right placeholders.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Set BUILD_DIAG=1 to inject bisection checkpoints + diagnostic overlay (~600 KB larger Index.html). */
const BUILD_DIAG = process.env.BUILD_DIAG === '1';

const SOURCE = path.resolve(__dirname, '..', 'dashboard-multi-issue.html');
const TARGET = path.resolve(__dirname, 'Index.html');
const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');
const NODE_MODULES = path.resolve(__dirname, '..', 'node_modules');

// CDN URL substring -> local node_modules file. We match on substring (not
// exact URL) so version bumps in dashboard-multi-issue.html keep working as
// long as `npm i` brings in a compatible artifact path.
//
// Why inline at all? Apps Script's HtmlService IFRAME sandbox refuses to load
// `<script src="https://cdn.jsdelivr.net/...">` (and most non-Google CDNs).
// The wrapper aborts with `Uncaught SyntaxError: Failed to execute 'write' on
// 'Document': Unexpected identifier 'href'` in user_iw.js, which prevents any
// of our inline scripts after it from running. Bundling the libraries inline
// removes the external dependency entirely.
const INLINE_CDN_LIBRARIES = [
  {
    urlMatch: 'cdn.jsdelivr.net/npm/chart.js',
    localPath: 'chart.js/dist/chart.umd.js',
    label: 'chart.js'
  },
  {
    urlMatch: 'cdn.jsdelivr.net/npm/chartjs-plugin-datalabels',
    localPath: 'chartjs-plugin-datalabels/dist/chartjs-plugin-datalabels.min.js',
    label: 'chartjs-plugin-datalabels'
  },
  {
    urlMatch: 'cdn.jsdelivr.net/npm/sortablejs',
    localPath: 'sortablejs/Sortable.min.js',
    label: 'sortablejs'
  }
];

const PREAMBLE_BEGIN = '<!-- BEGIN: appscript/build.js injection -->';
const PREAMBLE_END = '<!-- END: appscript/build.js injection -->';

// MIME map for assets we may inline. Keep narrow on purpose: we only inline
// images that the dashboard references via relative paths, not arbitrary files.
const INLINE_MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

/**
 * Replace `src="…/foo.png"` style attributes that resolve to files under
 * ../assets with `data:` URIs, because Apps Script's HtmlService does not
 * serve static files: any relative <img src> 404s on the deployed web app.
 *
 * Only rewrites paths that resolve to a real file under assets/ — anything
 * else (CDN URLs, generated paths, etc.) is left untouched.
 *
 * @param {string} html
 * @returns {{ html: string, inlinedCount: number, inlinedBytes: number }}
 */
function inlineLocalAssetReferences(html) {
  let inlinedCount = 0;
  let inlinedBytes = 0;
  const cache = new Map();

  // Match src="..." or src='...' inside img/source/link tags. We're permissive
  // about the attribute order; the regex just looks for src="<path>" pairs.
  const SRC_ATTR = /\bsrc\s*=\s*(["'])([^"']+)\1/g;

  const out = html.replace(SRC_ATTR, (match, quote, rawPath) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(rawPath)) return match; // http(s):, data:, etc.
    if (rawPath.startsWith('//')) return match;             // protocol-relative

    // Resolve relative to the source dashboard HTML's directory (repo root).
    const cleaned = rawPath.replace(/^\.\//, '').split(/[?#]/)[0];
    const onDisk = path.resolve(path.dirname(SOURCE), cleaned);
    if (!onDisk.startsWith(ASSETS_DIR + path.sep)) return match;
    if (!fs.existsSync(onDisk)) return match;

    const ext = path.extname(onDisk).toLowerCase();
    const mime = INLINE_MIME_BY_EXT[ext];
    if (!mime) return match;

    let dataUri = cache.get(onDisk);
    if (!dataUri) {
      const buf = fs.readFileSync(onDisk);
      dataUri = 'data:' + mime + ';base64,' + buf.toString('base64');
      cache.set(onDisk, dataUri);
      inlinedCount += 1;
      inlinedBytes += buf.length;
    }
    return 'src=' + quote + dataUri + quote;
  });

  return { html: out, inlinedCount, inlinedBytes };
}

/**
 * Replace `<script src="https://...cdn..."></script>` with `<script>…inlined
 * library content…</script>`. Matches each <script src> against
 * INLINE_CDN_LIBRARIES; URLs that don't match any entry are left untouched
 * (so any future first-party Google CDN reference still works).
 *
 * @param {string} html
 * @returns {{ html: string, inlinedCount: number, inlinedBytes: number, warnings: string[] }}
 */
function inlineCdnScripts(html) {
  let inlinedCount = 0;
  let inlinedBytes = 0;
  const warnings = [];

  // Match `<script src="..."[any attrs]></script>` (must be a closed tag).
  const SCRIPT_TAG = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi;

  const out = html.replace(SCRIPT_TAG, (match, srcUrl) => {
    const lib = INLINE_CDN_LIBRARIES.find(l => srcUrl.indexOf(l.urlMatch) !== -1);
    if (!lib) return match;

    const onDisk = path.resolve(NODE_MODULES, lib.localPath);
    if (!fs.existsSync(onDisk)) {
      warnings.push('SKIPPED ' + lib.label + ': ' + onDisk +
        ' missing — run `npm install` and rebuild.');
      return match;
    }

    let content = fs.readFileSync(onDisk, 'utf8');
    // Defensive: a literal `</script>` in the library content would close our
    // <script> tag prematurely. Standard minifiers don't emit this, but we
    // guard against it anyway.
    if (/<\/script>/i.test(content)) {
      content = content.replace(/<\/script>/gi, '<\\/script>');
    }
    inlinedCount += 1;
    inlinedBytes += content.length;
    return [
      '<!-- inlined ' + lib.label + ' (was: ' + srcUrl + ') -->',
      '<script>',
      content,
      '</script>'
    ].join('\n');
  });

  return { html: out, inlinedCount, inlinedBytes, warnings };
}

/**
 * Apps Script's HtmlService preprocessor mangles JS template literals that
 * contain `://` (URL prefixes), causing the inline <script> block to fail
 * to parse at runtime. Documented community workaround:
 *   `https://example.com`    ->   `https:\/\/example.com`
 * See https://stackoverflow.com/questions/61692427/ and
 *     https://issuetracker.google.com/issues/156139610
 *
 * The escape `\/` is a no-op inside a JS template literal at runtime
 * (evaluates to plain `/`), so the fix is invisible to the dashboard logic
 * and to the local + GitHub Pages builds (we only apply it here).
 *
 * We restrict the rewrite to backtick-delimited spans because regular
 * single/double-quoted strings work fine in Apps Script, and we don't want
 * to touch URLs inside line comments, block comments, or regex literals
 * (a `://` inside a `/.../` regex would change semantics).
 *
 * @param {string} html
 * @returns {{ html: string, escapedCount: number }}
 */
function escapeUrlsInTemplateLiterals(html) {
  let escapedCount = 0;

  // Process every <script>…</script> body independently. We deliberately
  // ignore <script src="..."> because CDN inlining replaces those before we
  // run, and any remaining `<script src>` shouldn't have a body.
  const SCRIPT_BLOCK = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;

  // Match a backtick-delimited template literal that contains `://`
  // somewhere in its content. We use a non-greedy match between backticks
  // and respect `\\\`` escapes via the alternation `[^`\\]|\\.`.
  // ${ ... } substitutions are matched as ordinary content; we only need
  // to find the literal `://` chars to rewrite, and substitutions that
  // contain backticks of their own would be a non-trivial rarity in this
  // codebase (none present today).
  const TEMPLATE_LITERAL_WITH_URL = /`(?:[^`\\]|\\.)*:\/\/(?:[^`\\]|\\.)*`/g;

  const out = html.replace(SCRIPT_BLOCK, (match, openTag, body, closeTag) => {
    if (/\bsrc\s*=/.test(openTag)) return match; // external <script src> - skip
    if (body.indexOf('://') === -1) return match; // fast path
    const newBody = body.replace(TEMPLATE_LITERAL_WITH_URL, (lit) => {
      // Replace every occurrence of `://` inside this template literal
      // with `:\/\/`. Both forms produce the same runtime string, but
      // the escaped form is invisible to Apps Script HtmlService's
      // preprocessor.
      const escaped = lit.replace(/:\/\//g, ':\\/\\/');
      // Count by counting `://` occurrences in the original literal.
      escapedCount += (lit.match(/:\/\//g) || []).length;
      return escaped;
    });
    return openTag + newBody + closeTag;
  });

  return { html: out, escapedCount };
}

// Locally-bundled font weights inlined in place of the Google Fonts <link>.
// Each entry maps a (family, weight) pair the dashboard's CSS asks for to a
// woff2 file shipped by an @fontsource/* package. Lato 500 is intentionally
// omitted — Lato as a typeface only ships 100/300/400/700/900; the browser
// will pick the nearest available weight (400) for any `font-weight: 500`
// rule, matching what Google Fonts' own server-side substitution does.
const FONT_FACE_FILES = [
  { family: 'Lato',          weight: 400, file: '@fontsource/lato/files/lato-latin-400-normal.woff2' },
  { family: 'Lato',          weight: 700, file: '@fontsource/lato/files/lato-latin-700-normal.woff2' },
  { family: 'Domine',        weight: 400, file: '@fontsource/domine/files/domine-latin-400-normal.woff2' },
  { family: 'Domine',        weight: 500, file: '@fontsource/domine/files/domine-latin-500-normal.woff2' },
  { family: 'Domine',        weight: 600, file: '@fontsource/domine/files/domine-latin-600-normal.woff2' },
  { family: 'Domine',        weight: 700, file: '@fontsource/domine/files/domine-latin-700-normal.woff2' },
  { family: 'Archivo Black', weight: 400, file: '@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2' }
];

/**
 * Read every entry in FONT_FACE_FILES off disk and emit a single <style> block
 * containing matching `@font-face` rules whose `src` is a `data:font/woff2;
 * base64,...` URI. Entries that aren't installed (e.g. `npm install` not yet
 * run) are quietly skipped and reported in `warnings` so we don't fail the
 * whole build for one missing weight.
 *
 * @returns {{ block: string, inlinedCount: number, inlinedBytes: number, warnings: string[] }}
 */
function buildInlinedFontsStyleBlock() {
  const rules = [];
  const warnings = [];
  let inlinedCount = 0;
  let inlinedBytes = 0;

  FONT_FACE_FILES.forEach((spec) => {
    const onDisk = path.resolve(NODE_MODULES, spec.file);
    if (!fs.existsSync(onDisk)) {
      warnings.push('SKIPPED font ' + spec.family + ' ' + spec.weight + ': ' +
        onDisk + ' missing — run `npm install` and rebuild.');
      return;
    }
    const buf = fs.readFileSync(onDisk);
    const dataUri = 'data:font/woff2;base64,' + buf.toString('base64');
    inlinedCount += 1;
    inlinedBytes += buf.length;
    rules.push(
      '@font-face {' +
      ' font-family: \'' + spec.family + '\';' +
      ' font-style: normal;' +
      ' font-weight: ' + spec.weight + ';' +
      ' font-display: swap;' +
      ' src: url("' + dataUri + '") format("woff2");' +
      ' }'
    );
  });

  const block = '<style id="__appscript_inlined_fonts">\n' +
    rules.join('\n') + '\n</style>';
  return { block, inlinedCount, inlinedBytes, warnings };
}

/**
 * Apps Script's IFRAME sandbox wrapper (user_iw.js) repeatedly chokes on the
 * Google Fonts <link href="..."> in <head>, surfacing as
 *   `Uncaught SyntaxError: Unexpected identifier 'href' at userCodeAppPanel:N`
 * inside Google's wrapper code, which then aborts before any of our page
 * scripts run (resulting in `Loading bug data...` stuck forever).
 *
 * Even after escaping `&` -> `&amp;` the URL still contained enough complex
 * tokens (`+`, `:`, `;`, `@`, multiple `family=` repeats) for v4-era wrapper
 * versions to fail. We can't keep the external <link>, but losing the fonts
 * makes the deployed dashboard look noticeably different from the local
 * one. So for `fonts.googleapis.com` links we splice in an inlined <style>
 * block of `@font-face` rules whose `src` is a base64 data: URI for the
 * matching woff2 file shipped by `@fontsource/*` (see FONT_FACE_FILES).
 *
 * Any *other* `*.googleapis.com` <link> (none today, but leave the legacy
 * behavior in place for future first-party Google CDN links) is replaced
 * with an HTML comment so the wrapper still parses cleanly.
 *
 * @param {string} html
 * @returns {{ html: string, strippedCount: number, inlinedFontsCount: number, inlinedFontsBytes: number, fontWarnings: string[] }}
 */
function stripExternalLinkTags(html) {
  let strippedCount = 0;
  let inlinedFontsCount = 0;
  let inlinedFontsBytes = 0;
  let fontWarnings = [];
  let cachedBlock = null;
  let fontsLinkSeen = 0;

  const out = html.replace(
    /<link\b[^>]*\bhref\s*=\s*"([^"]+)"[^>]*>/gi,
    (match, hrefValue) => {
      const isFontsLink = /^https:\/\/fonts\.googleapis\.com\//i.test(hrefValue);
      const isOtherGoogleapis = /^https:\/\/[^/]*googleapis\.com\//i.test(hrefValue);

      if (isFontsLink) {
        fontsLinkSeen += 1;
        if (!cachedBlock) {
          cachedBlock = buildInlinedFontsStyleBlock();
          inlinedFontsCount = cachedBlock.inlinedCount;
          inlinedFontsBytes = cachedBlock.inlinedBytes;
          fontWarnings = cachedBlock.warnings;
        }
        const safeHref = hrefValue.replace(/--+/g, '-').substring(0, 120);
        // First match emits the <style> block; later duplicates collapse to
        // a comment so we never write the same @font-face rules twice.
        if (fontsLinkSeen === 1) {
          return '<!-- inlined by appscript/build.js: ' + safeHref + ' -->\n' +
            cachedBlock.block;
        }
        return '<!-- inlined (already emitted) by appscript/build.js: ' + safeHref + ' -->';
      }

      if (isOtherGoogleapis) {
        strippedCount += 1;
        return '<!-- stripped by appscript/build.js: ' +
          hrefValue.replace(/--+/g, '-').substring(0, 120) + ' -->';
      }

      return match;
    }
  );

  return { html: out, strippedCount, inlinedFontsCount, inlinedFontsBytes, fontWarnings };
}

// Runtime diagnostic overlay: surfaces any window.error / unhandledrejection
// inside a fixed banner at the top of the page, plus echoes a short trace of
// where the runtime adapter / data loader got to. Critical when debugging
// inside Apps Script's iframe sandbox where DevTools can hide our logs behind
// an outer "top" frame that isn't where our code actually runs.
const DIAGNOSTIC_OVERLAY = [
  '<style id="__appscript_diag_style">',
  '  #__appscript_diag {',
  '    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;',
  '    background: #1a1a1a; color: #f5f5f5; font: 12px/1.5 ui-monospace,Menlo,monospace;',
  '    padding: 6px 12px; border-bottom: 2px solid #EE164F; max-height: 60vh;',
  '    overflow: auto; white-space: pre-wrap; word-break: break-word; display: none;',
  '  }',
  '  #__appscript_diag.show { display: block; }',
  '  #__appscript_diag .diag-err { color: #ff6b6b; }',
  '  #__appscript_diag .diag-info { color: #74c0fc; }',
  '  #__appscript_diag .diag-ok { color: #51cf66; }',
  '  #__appscript_diag button {',
  '    float: right; background: #EE164F; color: white; border: none;',
  '    padding: 2px 8px; border-radius: 4px; cursor: pointer; font: inherit;',
  '  }',
  '</style>',
  '<div id="__appscript_diag"><button onclick="this.parentNode.classList.remove(\'show\')">close</button><span id="__appscript_diag_body">[diag]</span></div>',
  '<script>',
  '(function(){',
  // Stack traces from Apps Script\'s iframe wrapper can be long; cap at this',
  // length so the overlay stays usable without losing the top frames that',
  // actually point at the offending code.',
  '  var STACK_CAP = 1200;',
  '  var truncate = function(s, n) {',
  '    if (s == null) return "";',
  '    s = String(s);',
  '    return s.length > n ? s.substr(0, n) + " [+" + (s.length - n) + " more chars]" : s;',
  '  };',
  '  var diag = function(level, msg) {',
  '    try {',
  '      var box = document.getElementById("__appscript_diag");',
  '      var body = document.getElementById("__appscript_diag_body");',
  '      if (!box || !body) return;',
  '      var line = document.createElement("div");',
  '      line.className = "diag-" + level;',
  '      var time = new Date().toISOString().substr(11,8);',
  '      line.textContent = "[" + time + "] [" + level + "] " + msg;',
  '      body.appendChild(line);',
  '      // The overlay no longer pops itself open on errors — every diag entry',
  '      // is still appended to the (hidden) #__appscript_diag_body for forensic',
  '      // recovery, but normal users never see it. To reveal it manually for',
  '      // debugging, run in the DevTools console:',
  '      //   document.getElementById("__appscript_diag").classList.add("show")',
  '      // or call window.__diagShow().',
  '    } catch(e) {}',
  '  };',
  '  // Convenience hook to expose the captured diagnostic log on demand. Stays',
  '  // off by default so transient/non-fatal errors do not splash a banner over',
  '  // the dashboard while users are working.',
  '  window.__diagShow = function() {',
  '    var box = document.getElementById("__appscript_diag");',
  '    if (box) box.classList.add("show");',
  '  };',
  '  window.__diagHide = function() {',
  '    var box = document.getElementById("__appscript_diag");',
  '    if (box) box.classList.remove("show");',
  '  };',
  '  window.__diag = diag;',
  '  // window.error: the browser surfaces uncaught exceptions here. We pull',
  '  // both the headline and the full stack so that errors with no filename',
  '  // (inline scripts, eval-d wrapper code) can still be traced.',
  '  window.addEventListener("error", function(e) {',
  '    var msg = (e && e.message) || "(no message)";',
  '    var loc = (e && e.filename ? e.filename : "") + ":" + (e && e.lineno ? e.lineno : "?");',
  '    var stack = (e && e.error && e.error.stack) ? truncate(e.error.stack, STACK_CAP) : "(no stack)";',
  '    diag("err", "window.error: " + msg + " @ " + loc);',
  '    diag("err", "stack: " + stack);',
  '  });',
  '  window.addEventListener("unhandledrejection", function(e) {',
  '    var r = e && e.reason;',
  '    var msg = (r && (r.message || r.toString && r.toString())) || String(r);',
  '    var stack = (r && r.stack) ? truncate(r.stack, STACK_CAP) : "(no stack)";',
  '    diag("err", "unhandled rejection: " + msg);',
  '    diag("err", "stack: " + stack);',
  '  });',
  '  // Mirror console.error into the overlay too. Some failure paths inside',
  '  // libraries (e.g. Chart.js dispatching to a listener that turned out to',
  '  // be undefined) are reported here without bubbling up to window.error,',
  '  // so without this hook the overlay would stay silent for them.',
  '  try {',
  '    var origErr = (typeof console !== "undefined" && console.error) ? console.error.bind(console) : null;',
  '    if (typeof console !== "undefined") {',
  '      console.error = function() {',
  '        try {',
  '          var parts = [];',
  '          for (var i = 0; i < arguments.length; i++) {',
  '            var a = arguments[i];',
  '            if (a && a.stack) parts.push(truncate(a.stack, STACK_CAP));',
  '            else if (a && typeof a === "object") {',
  '              try { parts.push(JSON.stringify(a)); } catch (_je) { parts.push(String(a)); }',
  '            } else parts.push(String(a));',
  '          }',
  '          diag("err", "console.error: " + parts.join(" "));',
  '        } catch(_e) {}',
  '        if (origErr) origErr.apply(console, arguments);',
  '      };',
  '    }',
  '  } catch(_e) {}',
  '  diag("info", "diagnostic overlay armed");',
  '})();',
  '</script>'
].join('\n');

function buildPreambleBlock() {
  return [
    PREAMBLE_BEGIN,
    BUILD_DIAG ? DIAGNOSTIC_OVERLAY : '',
    '<script>',
    '    // Populated by Apps Script HtmlService templating in Code.gs',
    '    // (`template.appsScriptUrl` and `template.shareToken`). When the file',
    '    // is opened directly without server-side rendering, both stay empty',
    '    // and the runtime adapter falls back to local-mode behavior.',
    "    window.__APPSCRIPT_URL__   = '<?!= (typeof appsScriptUrl !== \"undefined\") ? appsScriptUrl : \"\" ?>';",
    "    window.__APPSCRIPT_TOKEN__ = '<?!= (typeof shareToken    !== \"undefined\") ? shareToken    : \"\" ?>';",
    '    if (typeof window.__diag === "function") {',
    "      window.__diag('info', 'APPSCRIPT_URL = ' + (window.__APPSCRIPT_URL__ || '(empty)'));",
    '    }',
    '</script>',
    PREAMBLE_END,
    ''
  ].join('\n');
}

function build() {
  if (!fs.existsSync(SOURCE)) {
    console.error('ERROR: source file not found: ' + SOURCE);
    process.exit(1);
  }

  let html = fs.readFileSync(SOURCE, 'utf8');

  // Strip any previous injection so this script is idempotent.
  const prevInjection = new RegExp(
    PREAMBLE_BEGIN.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') +
    '[\\s\\S]*?' +
    PREAMBLE_END.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') +
    '\\n?',
    'g'
  );
  html = html.replace(prevInjection, '');

  // Inject right after the opening <head> tag. This is before any other <script>
  // so window.__APPSCRIPT_URL__ is defined by the time the runtime adapter runs.
  const headOpen = html.indexOf('<head>');
  if (headOpen === -1) {
    console.error('ERROR: could not find <head> in source HTML');
    process.exit(1);
  }
  const insertAt = headOpen + '<head>'.length;
  let out = html.slice(0, insertAt) + '\n    ' + buildPreambleBlock() + html.slice(insertAt);

  // Apps-Script-only fixups: HtmlService doesn't serve static files, and its
  // iframe wrapper trips on certain external <link>/<script> URLs.
  const stripped = stripExternalLinkTags(out);
  out = stripped.html;
  const inlinedCdn = inlineCdnScripts(out);
  out = inlinedCdn.html;
  const inline = inlineLocalAssetReferences(out);
  out = inline.html;
  // HtmlService preprocessor mangles `://` inside JS template literals.
  // Must run AFTER CDN inlining so we also process inlined library bodies if
  // they happen to contain backtick URLs.
  const escaped = escapeUrlsInTemplateLiterals(out);
  out = escaped.html;

  if (BUILD_DIAG) {
    // Bisection checkpoints (debug-only — omit in production builds).
    const checkpoints = [
      { needle: '<!-- END: appscript/build.js injection -->', label: 'CKPT-after-preamble' },
      { needle: '<style>', label: 'CKPT-before-style' },
      { needle: '</style>', label: 'CKPT-after-style' },
      { needle: '<!-- inlined chart.js', label: 'CKPT-before-chartjs' },
      { needle: '<!-- inlined chartjs-plugin-datalabels', label: 'CKPT-before-datalabels' },
      { needle: '<!-- inlined sortablejs', label: 'CKPT-before-sortable' },
      { needle: '</head>', label: 'CKPT-after-head' },
      { needle: '<body', label: 'CKPT-at-body-open' }
    ];
    checkpoints.forEach((cp, i) => {
      const tag = '<script>if(window.__diag)window.__diag("info","' + cp.label + ' #' + i + '");</script>\n';
      out = out.replace(cp.needle, tag + cp.needle);
    });
  }

  if (BUILD_DIAG) {
  // Bisection AROUND and INSIDE the dashboard's main inline <script> block.
  //
  // Why: prior bisection showed every CKPT in the <head> + body-open fires, but
  // the runtime probe still reports RUNTIME=<undefined>. That means the main
  // <script> block never finished executing. To diagnose we surround it with
  //   - CKPT-before-main   (separate <script> tag, fires regardless)
  //   - MAIN-FIRST-LINE    (injected as first JS statement of main block)
  //   - MAIN-LAST-LINE     (injected as last JS statement of main block; also
  //                         copies RUNTIME onto window so the probe can see it)
  //   - CKPT-after-main    (separate <script> tag after main block closes)
  //
  // Decision matrix:
  //   before fires, FIRST-LINE missing, LAST missing, after fires
  //     -> main script has a SYNTAX ERROR (parse-time failure)
  //   before, FIRST-LINE fire, LAST missing, after fires
  //     -> main script throws a RUNTIME ERROR partway through
  //   all four fire, but window.__main_runtime is "<undef-in-main>"
  //     -> RUNTIME variable scope issue inside main script
  //   all four fire, window.__main_runtime correct
  //     -> main script ran fine; problem is elsewhere
  // ---------------------------------------------------------------------------
  const MAIN_MARKER = 'RUNTIME ADAPTER (added for Apps Script enablement';
  const markerIdx = out.indexOf(MAIN_MARKER);
  if (markerIdx === -1) {
    console.warn('  ! Could not locate main <script> marker; skipping main-script bisection.');
  } else {
    // The opening tag is the LAST `<script>` (no src) before the marker. Our
    // CKPT scripts inserted above use the form `<script>if(window.__diag)...`,
    // so we need to find the bare `<script>\n` that opens the dashboard's main
    // block. Scan backwards looking for an opening tag that's NOT one of ours.
    let scriptOpenIdx = -1;
    let cursor = markerIdx;
    while (cursor > 0) {
      const idx = out.lastIndexOf('<script>', cursor);
      if (idx === -1) break;
      // Ours always start with `<script>if(window.__diag)`; the dashboard's
      // main one is just `<script>\n`. Match on the immediate next character.
      const next = out.charAt(idx + '<script>'.length);
      if (next === '\n' || next === '\r' || next === ' ' || next === '\t') {
        scriptOpenIdx = idx;
        break;
      }
      cursor = idx - 1;
    }
    const scriptCloseIdx = out.indexOf('</script>', markerIdx);
    if (scriptOpenIdx === -1 || scriptCloseIdx === -1) {
      console.warn('  ! Could not locate main <script> bounds; skipping main-script bisection.');
    } else {
      const mainOpenTag = '<script>';
      const mainCloseTag = '</script>';
      const before = out.slice(0, scriptOpenIdx);
      const mainBody = out.slice(scriptOpenIdx + mainOpenTag.length, scriptCloseIdx);
      const after = out.slice(scriptCloseIdx + mainCloseTag.length);

      const ckptBefore = '<script>if(window.__diag)window.__diag("info","CKPT-before-main #M0");</script>\n';
      const ckptAfter = '\n<script>if(window.__diag)window.__diag("info","CKPT-after-main #M3");</script>';

      // Injected as first/last JS statement of the dashboard's main block.
      // Wrapped in try/catch so they can never throw on their own.
      const injectFirst = [
        '',
        '    try { if (window.__diag) window.__diag("info", "CKPT-MAIN-FIRST-LINE #M1"); } catch (__e1) {}',
        ''
      ].join('\n');
      const injectLast = [
        '',
        '    try {',
        '      if (window.__diag) window.__diag("info", "CKPT-MAIN-LAST-LINE #M2");',
        '      window.__main_runtime = (typeof RUNTIME !== "undefined") ? RUNTIME : "<undef-in-main>";',
        '      window.__main_api_base = (typeof API_BASE !== "undefined") ? String(API_BASE) : "<undef-in-main>";',
        '    } catch (__e2) {',
        '      if (window.__diag) window.__diag("err", "main-last probe: " + (__e2 && __e2.message));',
        '    }',
        ''
      ].join('\n');

      out = before
        + ckptBefore
        + mainOpenTag
        + injectFirst
        + mainBody
        + injectLast
        + mainCloseTag
        + ckptAfter
        + after;
      console.log('Wrapped main <script> block (' + Math.round(mainBody.length / 1024) +
        ' KB) with bisection probes (CKPT-before-main, MAIN-FIRST-LINE, MAIN-LAST-LINE, CKPT-after-main).');
    }
  }
  }

  if (BUILD_DIAG) {
    // Final state-probe before </body> (debug-only).
    const STATE_PROBE = [
      '<script>',
      '(function(){',
      '  setTimeout(function(){',
      '    if (typeof window.__diag !== "function") return;',
      '    try {',
      '      window.__diag("info", "window.Chart=" + (typeof window.Chart !== "undefined" ? "OK" : "<missing>"));',
      '      window.__diag("info", "window.Sortable=" + (typeof window.Sortable !== "undefined" ? "OK" : "<missing>"));',
      '      window.__diag("info", "window.__main_runtime=" + (window.__main_runtime || "<not-set>"));',
      '      window.__diag("info", "window.__main_api_base=" + (window.__main_api_base || "<not-set>"));',
      '      window.__diag("info", "RUNTIME(global)=" + (typeof RUNTIME !== "undefined" ? RUNTIME : "<undefined>"));',
      '      window.__diag("info", "API_BASE(global)=" + (typeof API_BASE !== "undefined" ? API_BASE : "<undefined>"));',
      '      window.__diag("info", "data=" + (typeof data !== "undefined" ? "loaded:" + (data && data.issues && data.issues.length) : "<undefined>"));',
      '      var s = document.getElementById("status"); ',
      '      window.__diag("info", "status=" + (s ? s.textContent.trim().substring(0,80) : "<no #status>"));',
      '    } catch(e) { window.__diag("err", "probe failed: " + e.message); }',
      '  }, 2500);',
      '})();',
      '</script>'
    ].join('\n');
    out = out.replace('</body>', STATE_PROBE + '\n</body>');
  }

  fs.writeFileSync(TARGET, out, 'utf8');

  const sizeKb = Math.round(out.length / 1024);
  const inlinedKb = Math.round(inline.inlinedBytes / 1024);
  console.log('Wrote ' + path.relative(process.cwd(), TARGET) +
    ' (' + sizeKb + ' KB) from ' + path.relative(process.cwd(), SOURCE));
  console.log('Inlined ' + inline.inlinedCount + ' local asset(s) (~' + inlinedKb +
    ' KB) as data: URIs (Apps Script does not serve relative <img src>).');
  console.log('Inlined ' + stripped.inlinedFontsCount + ' Google Fonts woff2 file(s) (~' +
    Math.round(stripped.inlinedFontsBytes / 1024) +
    ' KB) as @font-face data: URIs (Apps Script iframe blocks the Google Fonts <link>).');
  console.log('Stripped ' + stripped.strippedCount +
    ' other external <link> tag(s) (Apps Script iframe wrapper SyntaxError workaround).');
  console.log('Inlined ' + inlinedCdn.inlinedCount + ' CDN <script src> tag(s) (~' +
    Math.round(inlinedCdn.inlinedBytes / 1024) +
    ' KB) — Apps Script iframe blocks external scripts.');
  console.log('Escaped ' + escaped.escapedCount +
    ' "://" occurrence(s) inside JS template literals (HtmlService bug workaround).');
  if (stripped.fontWarnings && stripped.fontWarnings.length) {
    stripped.fontWarnings.forEach(w => console.warn('  ! ' + w));
  }
  if (inlinedCdn.warnings.length) {
    inlinedCdn.warnings.forEach(w => console.warn('  ! ' + w));
  }
  if (BUILD_DIAG) {
    console.log('  BUILD_DIAG=1: diagnostic HTML hooks included.');
  } else {
    console.log('  Production build (set BUILD_DIAG=1 to add bisection / overlay).');
  }
}

if (require.main === module) {
  build();
}

module.exports = { build };
