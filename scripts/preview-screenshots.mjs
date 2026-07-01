// Preview-harness screenshotter.
//
// Navigates each auth-mock preview surface at
//   http://127.0.0.1:3000/dev/preview/<surface>
// and captures light + dark screenshots to
//   /tmp/preview-<surface>-<theme>.png
//
// The /dev/preview/* routes mount the REAL composed surfaces (profile,
// feed, settings, workspace) wrapped in MockFetchProvider, so they render
// fully populated with fixture data while signed-out. This script exists
// so a visual regression of those surfaces can be captured without a live
// backend or a real session.
//
// Usage:
//   node scripts/preview-screenshots.mjs
//   BASE=http://127.0.0.1:3000 node scripts/preview-screenshots.mjs
//   FIXTURE=empty node scripts/preview-screenshots.mjs   (empty-state pass)
//
// Requires the dev server to already be running. Uses the repo's bundled
// Playwright (node_modules/playwright).

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const FIXTURE = process.env.FIXTURE || ""; // "" | "empty"
const OUT_DIR = process.env.OUT_DIR || "/tmp";

const SURFACES = [
  "profile",
  "profile-org",
  "feed",
  "settings",
  "workspace",
  "create",
  "profile-edit",
  "activity-edit",
];
const THEMES = ["light", "dark"];

const VIEWPORT = { width: 1440, height: 900 };

function urlFor(surface) {
  const u = new URL(`/dev/preview/${surface}`, BASE);
  if (FIXTURE) u.searchParams.set("fixture", FIXTURE);
  return u.toString();
}

function outFile(surface, theme) {
  const suffix = FIXTURE ? `-${FIXTURE}` : "";
  return `${OUT_DIR}/preview-${surface}-${theme}${suffix}.png`;
}

// Pre-warm: compile each route once so Playwright's navigation isn't
// racing the first Next.js compile (which can blow the timeout).
async function prewarm() {
  console.log("Pre-warming preview routes...");
  for (const surface of SURFACES) {
    const url = urlFor(surface);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60_000);
    const t0 = Date.now();
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      console.log(`  ${r.status} ${url} (${Date.now() - t0}ms)`);
    } catch {
      console.log(`  TIMEOUT ${url}`);
    } finally {
      clearTimeout(t);
    }
  }
}

async function main() {
  await prewarm();

  const browser = await chromium.launch();
  let ok = 0;
  let failed = 0;

  try {
    for (const theme of THEMES) {
      const ctx = await browser.newContext({
        viewport: VIEWPORT,
        colorScheme: theme,
        deviceScaleFactor: 2,
      });
      // next-themes persists to localStorage under "theme" and flips the
      // `data-theme` attribute on <html>. Seed both the storage key and
      // the attribute so the first paint is already in the target theme
      // (no flash, no system-pref dependence).
      await ctx.addInitScript((t) => {
        try {
          localStorage.setItem("theme", t);
          document.documentElement.setAttribute("data-theme", t);
          document.documentElement.style.colorScheme = t;
        } catch {
          /* ignore */
        }
      }, theme);

      const page = await ctx.newPage();
      page.on("pageerror", (err) => {
        console.error(`  [pageerror] ${err.message.split("\n")[0]}`);
      });

      for (const surface of SURFACES) {
        const url = urlFor(surface);
        const file = outFile(surface, theme);
        try {
          await page.goto(url, {
            waitUntil: "networkidle",
            timeout: 30_000,
          });
          // Settle: let the fixture-driven fetches resolve + render.
          await page.waitForTimeout(800);
          await page.screenshot({ path: file, fullPage: true, timeout: 20_000 });
          ok++;
          console.log(`✓ ${surface} (${theme}) → ${file}`);
        } catch (e) {
          failed++;
          console.error(`✗ ${surface} (${theme}): ${e.message.split("\n")[0]}`);
        }
      }

      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone. ok=${ok} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
