// Other apps that show the same open records: a project's or an account's
// page there. Records belong to their authors, not to an app, so a project
// Ma Earth funded is also a project GainForest shows and certified.app shows;
// linking to those pages says so. A short, curated list while the ecosystem
// is small; how each app's pages are found is in lib/hypercerts/platform-links.

export type PlatformId = "maearth" | "gainforest" | "goodmarket";

export type Platform = {
  id: PlatformId;
  name: string;
  /** Its app icon, in public/platforms. */
  icon: string;
  /** What it is, in a few words: the link's tooltip. */
  about: string;
  /** Its account (DID), where its badges come from. */
  did: string;
};

export const PLATFORMS: Record<PlatformId, Platform> = {
  maearth: {
    id: "maearth",
    name: "Ma Earth",
    icon: "/platforms/maearth.png",
    about: "Collective funding for regenerative land projects",
    did: "did:plc:7ffezlhobzihdt3nbazysgvr",
  },
  gainforest: {
    id: "gainforest",
    name: "GainForest",
    icon: "/platforms/gainforest.png",
    about: "Biodiversity monitoring and funding for nature stewards",
    did: "did:plc:yjck2sybksyigp3zvbq7bfki",
  },
  goodmarket: {
    id: "goodmarket",
    name: "Good Market",
    icon: "/platforms/goodmarket.png",
    about: "A digital commons for social enterprises",
    did: "did:plc:ipcx4wzsuz3c6nkqgas75rxw",
  },
};

/** A page on another app: which app, where, and a note ("Round 3"). */
export type PlatformLink = { platform: PlatformId; href: string; note: string | null };

/** The domains of the apps above, to leave out of an account's own links when shown here. */
export const PLATFORM_HOSTS: Record<PlatformId, string> = {
  maearth: "maearth.com",
  gainforest: "gainforest.app",
  goodmarket: "goodmarket.global",
};
