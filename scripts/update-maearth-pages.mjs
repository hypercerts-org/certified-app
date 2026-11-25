// Builds data/maearth-pages.json: which Ma Earth page shows which project and
// which organization, so a project or a profile can link to its page there.
//
// Ma Earth's addresses are a name and a short code ("/the-community-mobiliz-
// 97c2a756/bb9ded71"), not derived from the records, so they are looked up:
// its public sitemap lists the pages, and each page names its record (a
// project page the project's URI; an organization page its atprotoDid).
// A stopgap until Ma Earth writes its page addresses into the records, as Good
// Market does on its badges. Run with `node scripts/update-maearth-pages.mjs`.

import { writeFile } from "node:fs/promises";

const SITE = "https://maearth.com";
const AGENT = "certified.app (page links; https://certified.app)";
const PARALLEL = 6;

async function text(url) {
  const response = await fetch(url, {
    headers: { "user-agent": AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

/** Runs `task` on every item, a few at a time; failures give null. */
async function each(items, task) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await task(items[i]).catch((err) => {
          console.warn(`skipped ${items[i]}: ${err.message}`);
          return null;
        });
      }
    }),
  );
  return out;
}

const sitemap = await text(`${SITE}/sitemap.xml`);
const pages = [...sitemap.matchAll(/<loc>(https:\/\/maearth\.com\/[^<]+)<\/loc>/g)].map(
  (m) => m[1],
);
const projectPages = pages.filter((url) =>
  /^https:\/\/maearth\.com\/[^/]+\/[0-9a-f]{8}$/.test(url),
);
const organizationPages = pages.filter((url) => url.startsWith(`${SITE}/organizations/`));

const projects = {};
for (const [url, html] of zip(projectPages, await each(projectPages, text))) {
  if (!html) continue;
  const uris = new Set(
    [
      ...html.matchAll(
        /at:\/\/(did:plc:[a-z2-7]{24})\/org\.hypercerts\.collection\/([a-z2-7]{13})/g,
      ),
    ].map((m) => `at://${m[1]}/org.hypercerts.collection/${m[2]}`),
  );
  // Only a page that names one project is that project's.
  if (uris.size === 1) projects[[...uris][0]] = url;
}

const accounts = {};
for (const [url, html] of zip(organizationPages, await each(organizationPages, text))) {
  // The organization's own DID comes first; later ones are its members'.
  const did = html?.match(/atprotoDid\\?"\s*:\s*\\?"(did:plc:[a-z2-7]{24})/)?.[1];
  if (did && !accounts[did]) accounts[did] = url;
}

function zip(a, b) {
  return a.map((item, i) => [item, b[i]]);
}

const sorted = (record) =>
  Object.fromEntries(Object.entries(record).sort(([x], [y]) => x.localeCompare(y)));
await writeFile(
  new URL("../data/maearth-pages.json", import.meta.url),
  `${JSON.stringify({ updated: new Date().toISOString().slice(0, 10), projects: sorted(projects), accounts: sorted(accounts) }, null, 1)}\n`,
);
console.log(
  `${Object.keys(projects).length} projects, ${Object.keys(accounts).length} organizations`,
);
