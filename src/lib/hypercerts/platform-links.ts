import "server-only";

import { cacheLife } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getAwardsFrom } from "@/lib/hypercerts/queries";
import { logError } from "@/lib/log";
import { PLATFORMS, type PlatformLink } from "@/lib/platforms";
import maearthPages from "../../../data/maearth-pages.json";

// Where an account or a project also has a page, on the apps in lib/platforms.
// Each app says it differently, so each is read its own way:
//
// - Good Market writes the account's page address on its "Good Market
//   Approved" badge: read live.
// - GainForest builds its addresses from the records' own identifiers
//   (/projects/{did}/{rkey}, /account/{did}); its public sitemap says which
//   pages exist, read once a day.
// - Ma Earth's addresses are its own, looked up in data/maearth-pages.json
//   (scripts/update-maearth-pages.mjs): a stopgap until it writes them into
//   the records. A Round 3 project without a page of its own leads to its
//   organization's.
//
// A source that can't be read leaves its link out; the page still shows.

const MAEARTH_ROUND_3 = "Ma Earth Round 3";
const GOODMARKET_APPROVED = "Good Market Approved";

const maearth = maearthPages as {
  projects: Record<string, string>;
  accounts: Record<string, string>;
};

/** A source's links, or none when it can't be read now (logged). */
async function safely(source: string, read: () => Promise<PlatformLink[]>) {
  try {
    return await read();
  } catch (err) {
    unstable_rethrow(err);
    logError(`[platform-links] ${source} unavailable`, err);
    return [];
  }
}

const GAINFOREST = "https://www.gainforest.app";

/** The pages GainForest lists in its sitemap: projects as "did/rkey", accounts as DIDs. */
async function gainforestPages(): Promise<{ projects: string[]; accounts: string[] }> {
  "use cache";
  cacheLife("days");
  const read = async (url: string) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response.text();
  };
  const index = await read(`${GAINFOREST}/sitemap.xml`);
  const maps = [...index.matchAll(/<loc>([^<]+\/(?:projects|organizations)-\d+\.xml)<\/loc>/g)].map(
    (m) => m[1],
  );
  const projects = new Set<string>();
  const accounts = new Set<string>();
  for (const xml of await Promise.all(maps.map(read))) {
    for (const [, path] of xml.matchAll(
      /<loc>https:\/\/www\.gainforest\.app\/en\/([^<]+)<\/loc>/g,
    )) {
      const [kind, ...rest] = decodeURIComponent(path).split("/");
      if (kind === "projects" && rest.length === 2) projects.add(rest.join("/"));
      if (kind === "account" && rest.length === 1) accounts.add(rest[0]);
    }
  }
  return { projects: [...projects], accounts: [...accounts] };
}

/** The other apps' pages for a project (an org.hypercerts.collection). */
export async function getProjectPlatformLinks(uri: string): Promise<PlatformLink[]> {
  const [, , did, , rkey] = uri.split("/");
  const groups = await Promise.all([
    safely("Ma Earth", async () => {
      const awards = await getAwardsFrom(PLATFORMS.maearth.did, uri);
      const round3 = awards.some((award) => award.title === MAEARTH_ROUND_3);
      const href = maearth.projects[uri] ?? (round3 ? maearth.accounts[did] : undefined);
      return href ? [{ platform: "maearth", href, note: null }] : [];
    }),
    safely("GainForest", async () => {
      const { projects } = await gainforestPages();
      return projects.includes(`${did}/${rkey}`)
        ? [
            {
              platform: "gainforest",
              href: `${GAINFOREST}/en/projects/${encodeURIComponent(did)}/${rkey}`,
              note: null,
            },
          ]
        : [];
    }),
  ]);
  return groups.flat();
}

/**
 * Whether the account has a page on Ma Earth (known without a request): its
 * own link to maearth.com then shows once, in "Also on".
 */
export function hasMaEarthPage(did: string): boolean {
  return did in maearth.accounts;
}

/** The other apps' pages for an account. */
export async function getAccountPlatformLinks(did: string): Promise<PlatformLink[]> {
  const groups = await Promise.all([
    safely("Ma Earth", async () => {
      const href = maearth.accounts[did];
      return href ? [{ platform: "maearth", href, note: null }] : [];
    }),
    safely("GainForest", async () => {
      const { accounts } = await gainforestPages();
      return accounts.includes(did)
        ? [
            {
              platform: "gainforest",
              href: `${GAINFOREST}/en/account/${encodeURIComponent(did)}`,
              note: null,
            },
          ]
        : [];
    }),
    safely("Good Market", async () => {
      const awards = await getAwardsFrom(PLATFORMS.goodmarket.did, did);
      const page = awards.find((award) => award.title === GOODMARKET_APPROVED && award.url);
      return page?.url ? [{ platform: "goodmarket", href: page.url, note: "Approved" }] : [];
    }),
  ]);
  return groups.flat();
}
