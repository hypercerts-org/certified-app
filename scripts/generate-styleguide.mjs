// generate-styleguide.mjs
//
// Generates the static styleguide at docs/component-library/index.html FROM
// the live dev gallery at /dev/gallery, so the two can't drift. This is the
// "single source of truth" approach (D6): the gallery TSX is authored once,
// and this script snapshots its rendered output + all the CSS the page uses
// into one self-contained HTML file that opens over file:// with no network.
//
// It ASSUMES a dev server is already running at http://127.0.0.1:3000.
// It does NOT start one. Run it like:
//
//   # in one terminal
//   npm run dev
//   # in another, once the server is up
//   npm run styleguide:generate
//
// What it does:
//   1. Launches headless chromium, navigates to /dev/gallery, waits for load
//      plus a short settle so client components have rendered.
//   2. Fetches every <link rel="stylesheet"> the page references and inlines
//      its text (this is how Tailwind utilities + globals + next/font are
//      served in dev), plus captures any inline <style> blocks.
//   3. Captures the gallery's rendered <body> HTML, strips the Next.js runtime
//      (<script> tags, hydration noise, dev error overlay / issue toast).
//   4. Wraps it in a clean, self-contained document with the inlined <style>,
//      a "GENERATED — do not edit by hand" header, and one tiny inline script
//      that toggles data-theme="dark" on <html>.
//
// Uses the repo's bundled Playwright.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs/component-library");
const OUT_FILE = join(OUT_DIR, "index.html");

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const GALLERY_URL = `${BASE}/dev/gallery`;

// Timeouts (ms). Generous because dev compiles the route on first hit.
const NAV_TIMEOUT = 60_000;
const SETTLE_MS = 1_200;
const FETCH_TIMEOUT = 20_000;

function log(...args) {
  console.log("[styleguide]", ...args);
}

/**
 * Fetch a URL's text with a timeout. Returns null (and logs) on failure so a
 * single unreachable stylesheet doesn't abort the whole snapshot.
 */
async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      log(`  WARN ${res.status} fetching ${url} — skipping`);
      return null;
    }
    return await res.text();
  } catch (e) {
    log(`  WARN failed to fetch ${url} (${e.message.split("\n")[0]}) — skipping`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Rewrite relative url(...) references inside a stylesheet to absolute URLs
 * against the dev server. next/font @font-face blocks point at /_next/... font
 * files with root-relative paths; left untouched they'd resolve against the
 * file:// document and fail. Pointing them at the running dev server keeps the
 * snapshot faithful while the server is up; when it isn't, the CSS already
 * declares system-ui / serif fallbacks so the page still renders.
 *
 * Skips data: URIs and anything already absolute (http:, https:, //).
 */
function absolutizeCssUrls(cssText, sheetUrl) {
  return cssText.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
    (match, quote, ref) => {
      const trimmed = ref.trim();
      if (
        trimmed.startsWith("data:") ||
        trimmed.startsWith("http://") ||
        trimmed.startsWith("https://") ||
        trimmed.startsWith("//")
      ) {
        return match;
      }
      try {
        const abs = new URL(trimmed, sheetUrl).toString();
        return `url(${quote}${abs}${quote})`;
      } catch {
        return match;
      }
    },
  );
}

async function main() {
  log(`Source : ${GALLERY_URL}`);
  log(`Output : ${OUT_FILE}`);
  log("Launching headless chromium…");

  const browser = await chromium.launch();
  let html;

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      colorScheme: "light",
    });
    const page = await ctx.newPage();
    page.on("pageerror", (err) =>
      log(`  [pageerror] ${err.message.split("\n")[0]}`),
    );

    log("Navigating…");
    const resp = await page.goto(GALLERY_URL, {
      waitUntil: "networkidle",
      timeout: NAV_TIMEOUT,
    });
    if (!resp) throw new Error("navigation returned no response");
    if (!resp.ok()) {
      throw new Error(
        `gallery returned HTTP ${resp.status()} — is the dev server running at ${BASE}? (note: /dev/gallery 404s under NODE_ENV=production)`,
      );
    }
    log(`  HTTP ${resp.status()} — settling ${SETTLE_MS}ms…`);
    await page.waitForTimeout(SETTLE_MS);

    // ---- 1. Collect every stylesheet the page uses -----------------------
    // Order matters for the cascade, so read links in document order.
    const sheetHrefs = await page.$$eval(
      'link[rel~="stylesheet"]',
      (links) => links.map((l) => l.href).filter(Boolean),
    );
    const inlineStyles = await page.$$eval("style", (els) =>
      els.map((el) => el.textContent || ""),
    );
    log(
      `Captured ${sheetHrefs.length} stylesheet link(s) + ${inlineStyles.length} inline <style> block(s).`,
    );

    const cssParts = [];
    for (const href of sheetHrefs) {
      const css = await fetchText(href);
      if (css == null) continue;
      cssParts.push(
        `/* ---- linked stylesheet: ${href} ---- */\n` +
          absolutizeCssUrls(css, href),
      );
      log(`  inlined ${css.length} bytes from ${href}`);
    }
    for (const css of inlineStyles) {
      if (css.trim()) {
        cssParts.push(
          `/* ---- inline <style> ---- */\n` + absolutizeCssUrls(css, BASE),
        );
      }
    }
    const inlinedCss = cssParts.join("\n\n");

    // ---- 2. Capture + sanitize the rendered body -------------------------
    // Run inside the page so we operate on the live DOM, then strip the
    // Next.js runtime and dev-only chrome before serializing.
    const capturedTheme = await page.evaluate(
      () => document.documentElement.getAttribute("data-theme") || "light",
    );

    const bodyHtml = await page.evaluate(() => {
      const body = document.body.cloneNode(true);

      // Drop all scripts (Next.js runtime, hydration payloads, inline boot).
      body.querySelectorAll("script").forEach((n) => n.remove());

      // Drop the Next.js dev error overlay / "N Issues" toast and portals.
      const devChromeSelectors = [
        "nextjs-portal",
        "[data-nextjs-toast]",
        "[data-nextjs-dialog-overlay]",
        "[data-nextjs-dialog]",
        "[data-nextjs-error-overlay]",
        "[data-next-mark]",
        "#__next-build-watcher",
        "[data-nextjs-dev-tools-button]",
        "[data-nextjs-devtools]",
      ];
      body
        .querySelectorAll(devChromeSelectors.join(","))
        .forEach((n) => n.remove());

      // Strip Next.js hydration noise attributes from every element.
      const walk = (el) => {
        for (const attr of Array.from(el.attributes || [])) {
          const name = attr.name;
          if (
            name.startsWith("data-next") ||
            name === "data-reactroot" ||
            name === "data-react-checksum"
          ) {
            el.removeAttribute(name);
          }
        }
        for (const child of Array.from(el.children)) walk(child);
      };
      walk(body);

      return body.innerHTML;
    });

    log(`  body HTML: ${bodyHtml.length} bytes (theme="${capturedTheme}")`);

    await ctx.close();

    // ---- 3. Assemble the self-contained document -------------------------
    const generatedAt = new Date().toISOString();
    html = buildDocument({ inlinedCss, bodyHtml, generatedAt });
  } finally {
    await browser.close();
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, html, "utf8");

  const bytes = Buffer.byteLength(html, "utf8");
  log("");
  log(`Wrote ${OUT_FILE}`);
  log(`Size  ${bytes.toLocaleString()} bytes (${(bytes / 1024).toFixed(1)} KiB)`);
  log("Done. Open it over file:// — light + dark via the header toggle.");
}

/**
 * Wrap the captured CSS + body into a clean, self-contained HTML document.
 * The header (banner + toggle) is gallery-local chrome; it carries its own
 * scoped styles so it doesn't depend on, or pollute, the captured design
 * system. The one inline <script> toggles data-theme="dark" on <html>.
 */
function buildDocument({ inlinedCss, bodyHtml, generatedAt }) {
  // Header banner styles use only fixed values / generic fonts so the banner
  // renders identically regardless of the captured token CSS.
  const headerCss = `
/* ==========================================================================
   GENERATED-STYLEGUIDE CHROME (not part of the captured design system).
   Scoped under .sg-gen-* so it can't collide with snapshot classes.
   ========================================================================== */
.sg-gen-banner {
  position: sticky;
  top: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 10px 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.4;
  color: #f9f9f9;
  background: #111111;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
}
.sg-gen-banner__msg { max-width: 78ch; }
.sg-gen-banner code {
  background: rgba(255, 255, 255, 0.12);
  padding: 1px 5px;
  border-radius: 2px;
}
.sg-gen-banner__toggle {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font: inherit;
  color: #111111;
  background: #f9f9f9;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 6px 12px;
}
.sg-gen-banner__toggle:hover { background: #ffffff; }
.sg-gen-banner__toggle:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}
`.trim();

  // Tiny, dependency-free theme toggle. Mirrors next-themes' contract: flips
  // data-theme on <html> and keeps color-scheme in sync.
  const toggleScript = `
(function () {
  var root = document.documentElement;
  var btn = document.getElementById("sg-theme-btn");
  var icon = document.getElementById("sg-theme-icon");
  var label = document.getElementById("sg-theme-label");
  function apply(theme) {
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
    var dark = theme === "dark";
    btn.setAttribute("aria-pressed", String(dark));
    if (icon) icon.textContent = dark ? "\\u2600" : "\\u263E";
    if (label) label.textContent = dark ? "Light" : "Dark";
  }
  btn.addEventListener("click", function () {
    apply(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });
})();
`.trim();

  return `<!DOCTYPE html>
<!--
  GENERATED FILE — DO NOT EDIT BY HAND.
  Produced from the live dev gallery at /dev/gallery by
  scripts/generate-styleguide.mjs. To refresh: start the dev server, then run
  \`npm run styleguide:generate\`. Editing this file directly will be lost on
  the next regeneration and defeats the single-source-of-truth guarantee.
  Generated: ${generatedAt}
-->
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Certified — Component Library Styleguide (generated)</title>
<style>
${headerCss}

/* ==========================================================================
   CAPTURED CSS — inlined verbatim from every stylesheet the live /dev/gallery
   page loads (Tailwind utilities, globals + token imports, next/font faces),
   plus any inline <style> blocks. Do not hand-edit; regenerate instead.
   ========================================================================== */
${inlinedCss}
</style>
</head>
<body>
<header class="sg-gen-banner" role="banner">
  <span class="sg-gen-banner__msg">
    GENERATED from <code>/dev/gallery</code> — do not edit by hand. Refresh with
    <code>npm run styleguide:generate</code>. Single source of truth: the
    gallery TSX, snapshotted here.
  </span>
  <button
    type="button"
    id="sg-theme-btn"
    class="sg-gen-banner__toggle"
    aria-pressed="false"
    aria-label="Toggle dark theme"
  >
    <span id="sg-theme-icon" aria-hidden="true">&#9790;</span>
    <span id="sg-theme-label">Dark</span>
  </button>
</header>
${bodyHtml}
<script>
${toggleScript}
</script>
</body>
</html>
`;
}

main().catch((e) => {
  console.error("[styleguide] FAILED:", e.message);
  process.exit(1);
});
