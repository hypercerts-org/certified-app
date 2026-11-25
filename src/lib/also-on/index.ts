import "server-only";

import { cacheLife } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getBadges, getRecordBadges } from "@/lib/hypercerts/queries";
import { didOf } from "@/lib/hypercerts/views";
import { logError } from "@/lib/log";
import gainforestIcon from "./icons/gainforest.png";
import goodmarketIcon from "./icons/goodmarket.png";
import maearthIcon from "./icons/maearth.png";
import maearthPages from "./maearth-pages.json";

// "Also on": where an account or a project also has a page, on other apps
// that show the same open records (records belong to their authors, not to
// an app). Everything this feature knows is in this folder, behind one
// function, getAlsoOn, because part of it isn't read from the protocol:
//
// - Good Market writes the account's page on its "Good Market Approved"
//   badge (an award's url): read from the protocol.
// - GainForest builds its addresses from the records' own identifiers
//   (/projects/{did}/{rkey}, /account/{did}); its public sitemap says which
//   pages exist, read once a day.
// - Ma Earth's addresses are its own, looked up in maearth-pages.json, which
//   update-maearth-pages.mjs rebuilds from its sitemap. A stopgap until Ma
//   Earth writes its page on its badges, as Good Market does. A project in
//   Round 3 (Ma Earth's own badge on it) without a page of its own leads to
//   its organization's.
//
// The apps are a short, curated list while the ecosystem is small. A source
// that can't be read leaves its link out; the page still shows.

/** A page on another app, ready to show: the app's name, icon and what it is, and the address. */
export type AlsoOnLink = {
  app: string;
  /** The app's icon, served by Next from this folder. */
  icon: string;
  /** What the app is, in a few words: the link's tooltip. */
  about: string;
  href: string;
  /** A word after the app's name ("Approved"), or null. */
  note: string | null;
};

const APPS = {
  maearth: {
    app: "Ma Earth",
    icon: maearthIcon.src,
    about: "Collective funding for regenerative land projects",
    did: "did:plc:7ffezlhobzihdt3nbazysgvr",
  },
  gainforest: {
    app: "GainForest",
    icon: gainforestIcon.src,
    about: "Biodiversity monitoring and funding for nature stewards",
  },
  goodmarket: {
    app: "Good Market",
    icon: goodmarketIcon.src,
    about: "A digital commons for social enterprises",
    did: "did:plc:ipcx4wzsuz3c6nkqgas75rxw",
  },
} as const;

type AppId = keyof typeof APPS;

const link = (id: AppId, href: string, note: string | null = null): AlsoOnLink => {
  const { app, icon, about } = APPS[id];
  return { app, icon, about, href, note };
};

const maearth = maearthPages as {
  projects: Record<string, string>;
  accounts: Record<string, string>;
};

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

/** A source's link, or none when it has none or can't be read now (logged). */
async function source(name: string, read: () => Promise<AlsoOnLink | null>) {
  try {
    return await read();
  } catch (err) {
    unstable_rethrow(err);
    logError(`[also-on] ${name} unavailable`, err);
    return null;
  }
}

async function forProject(uri: string): Promise<(AlsoOnLink | null)[]> {
  const did = didOf(uri);
  const rkey = uri.split("/").pop() ?? "";
  return Promise.all([
    source("Ma Earth", async () => {
      const own = maearth.projects[uri];
      if (own) return link("maearth", own);
      const organization = maearth.accounts[did];
      if (!organization) return null;
      const badges = await getRecordBadges(uri);
      const round3 = badges.some(
        (badge) => badge.issuer.did === APPS.maearth.did && badge.title === "Ma Earth Round 3",
      );
      return round3 ? link("maearth", organization) : null;
    }),
    source("GainForest", async () => {
      const { projects } = await gainforestPages();
      return projects.includes(`${did}/${rkey}`)
        ? link("gainforest", `${GAINFOREST}/en/projects/${encodeURIComponent(did)}/${rkey}`)
        : null;
    }),
  ]);
}

async function forAccount(did: string): Promise<(AlsoOnLink | null)[]> {
  return Promise.all([
    source("Ma Earth", async () => {
      const page = maearth.accounts[did];
      return page ? link("maearth", page) : null;
    }),
    source("GainForest", async () => {
      const { accounts } = await gainforestPages();
      return accounts.includes(did)
        ? link("gainforest", `${GAINFOREST}/en/account/${encodeURIComponent(did)}`)
        : null;
    }),
    source("Good Market", async () => {
      const { accepted, awaiting } = await getBadges(did);
      const approved = [...accepted, ...awaiting].find(
        (badge) =>
          badge.issuer.did === APPS.goodmarket.did &&
          badge.title === "Good Market Approved" &&
          badge.url,
      );
      return approved?.url ? link("goodmarket", approved.url, "Approved") : null;
    }),
  ]);
}

/**
 * The other apps' pages for `subject`: an account (its DID) or a project
 * (its org.hypercerts.collection URI). Empty for anything else.
 */
export async function getAlsoOn(subject: string): Promise<AlsoOnLink[]> {
  const links = subject.startsWith("did:")
    ? await forAccount(subject)
    : subject.includes("/org.hypercerts.collection/")
      ? await forProject(subject)
      : [];
  return links.filter((found): found is AlsoOnLink => found !== null);
}
