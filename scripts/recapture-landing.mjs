// Re-capture landing in light + dark to verify Phase 15 dark-mode work.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "docs/design-consolidation/after");
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
  });
  await ctx.addInitScript((t) => {
    try { localStorage.setItem("theme", t); } catch {}
  }, theme);
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/welcome", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(OUT, `landing_${theme}.png`), fullPage: true });
  console.log(`✓ landing ${theme}`);
  // Also capture /apps and /privacy as additional dark-mode tests.
  await page.goto("http://localhost:3000/apps", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `apps_${theme}.png`), fullPage: true });
  await page.goto("http://localhost:3000/privacy", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `privacy_${theme}.png`), fullPage: true });
  await ctx.close();
}
await browser.close();
console.log("done");
