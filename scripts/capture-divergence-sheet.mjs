// Capture the divergence-sheet.html in light + dark, full-page +
// per-section crops. Output: docs/design-audit/divergence/.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SHEET = "file://" + join(ROOT, "docs/design-audit/divergence-sheet.html");
const OUT = join(ROOT, "docs/design-audit/divergence");

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(SHEET, { waitUntil: "domcontentloaded" });
  // Apply theme after navigation — file:// + init script timing is fiddly.
  if (theme === "dark") {
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  }
  await page.waitForTimeout(300);

  // Full-page composite
  await page.screenshot({
    path: join(OUT, `_full_${theme}.png`),
    fullPage: true,
  });
  console.log(`✓ _full_${theme}.png`);

  // Per-section crops — locate each <section.section> and screenshot it
  const sections = await page.$$(".section");
  let i = 0;
  for (const sec of sections) {
    i++;
    const slug = (await sec.$eval(".section__num", (el) =>
      el.textContent
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    ));
    const file = join(OUT, `${String(i).padStart(2, "0")}-${slug}_${theme}.png`);
    await sec.screenshot({ path: file });
    console.log(`✓ ${i} ${slug} ${theme}`);
  }
  await ctx.close();
}
await browser.close();
console.log("done");
