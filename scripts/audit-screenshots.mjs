// Captures screenshots of every key surface in light + dark.
// Resilient: pre-warms each route via fetch (sequential, with timeout)
// so Next.js can compile it before Playwright loads it. Skips routes
// that won't respond within budget.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "docs/design-audit/screenshots");

const BASE = process.env.BASE || "http://localhost:3001";

const SURFACES = [
  { name: "01-root", url: "/", note: "Root entry point" },
  { name: "02-landing", url: "/welcome", note: "Marketing landing page" },
  { name: "03-home", url: "/home", note: "Signed-out home feed gate" },
  { name: "04-explore", url: "/explore", note: "Explore page" },
  { name: "05-search", url: "/search", note: "Search page" },
  { name: "06-notifications", url: "/notifications", note: "Notifications" },
  { name: "07-profile-index", url: "/profile", note: "Profile index" },
  { name: "08-settings", url: "/settings", note: "Settings root" },
  { name: "09-edit-profile", url: "/settings/edit-profile", note: "Edit profile" },
  { name: "10-groups", url: "/groups", note: "Groups index" },
  { name: "11-groups-create", url: "/groups/create", note: "Create a group" },
  { name: "12-create", url: "/create", note: "Create cert flow" },
  { name: "13-project-new", url: "/project/new", note: "Create project flow" },
  { name: "14-apps", url: "/apps", note: "Apps directory" },
  { name: "15-about", url: "/about", note: "About page" },
  { name: "16-privacy", url: "/privacy", note: "Privacy legal page" },
  { name: "17-terms", url: "/terms", note: "Terms legal page" },
  { name: "18-dsa", url: "/dsa", note: "DSA legal page" },
  { name: "19-imprint", url: "/imprint", note: "Imprint" },
  { name: "20-endorsements", url: "/endorsements", note: "Endorsements" },
  { name: "21-workspace", url: "/workspace", note: "Workspace" },
  { name: "22-404", url: "/__definitely_does_not_exist__", note: "Not-found" },
];

const VIEWPORTS = [
  { tag: "desktop", width: 1440, height: 900 },
  { tag: "mobile", width: 390, height: 844 },
];
const THEMES = ["light", "dark"];

await mkdir(OUT, { recursive: true });

// Pre-warm: compile each route once. We log status + time and skip
// anything that doesn't return within 30s.
const reachable = new Set();
console.log("Pre-warming routes...");
for (const s of SURFACES) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + s.url, { signal: ctrl.signal });
    const ms = Date.now() - t0;
    console.log(`  ${r.status} ${s.url} (${ms}ms)`);
    reachable.add(s.name);
  } catch (e) {
    console.log(`  TIMEOUT ${s.url} — skipping`);
  } finally {
    clearTimeout(t);
  }
}

const browser = await chromium.launch();
const results = [];
let ok = 0;
let failed = 0;

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: theme,
      deviceScaleFactor: 1,
    });
    await ctx.addInitScript((t) => {
      try { localStorage.setItem("theme", t); } catch {}
    }, theme);
    const page = await ctx.newPage();

    for (const s of SURFACES) {
      const file = join(OUT, `${s.name}_${viewport.tag}_${theme}.png`);
      if (!reachable.has(s.name)) {
        results.push({ ...s, viewport: viewport.tag, theme, error: "skipped (pre-warm timeout)", file: null });
        failed++;
        continue;
      }
      try {
        const resp = await page.goto(BASE + s.url, {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        });
        await page.waitForTimeout(700);
        await page.screenshot({ path: file, fullPage: true, timeout: 15_000 });
        ok++;
        const status = resp ? resp.status() : 0;
        results.push({ ...s, viewport: viewport.tag, theme, status, file });
        console.log(`✓ ${s.name} ${viewport.tag}/${theme} (${status})`);
      } catch (e) {
        failed++;
        results.push({ ...s, viewport: viewport.tag, theme, error: e.message.split("\n")[0], file: null });
        console.error(`✗ ${s.name} ${viewport.tag}/${theme}: ${e.message.split("\n")[0]}`);
      }
    }
    await ctx.close();
  }
}

await browser.close();
console.log(`\nDone. ok=${ok} failed=${failed}`);
await writeFile(join(OUT, "_manifest.json"), JSON.stringify(results, null, 2));
