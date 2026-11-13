/**
 * Partner apps surfaced on the /apps directory page. Add a new entry
 * by dropping a square logo (~256px) into public/assets/partners and
 * referencing it here. Order in this list is the order rendered.
 *
 * Every logo sits on the same 44px plate in --bg-sunken (app-tile.tsx),
 * full-bleed or with a transparent ground alike, so no per-app flag is
 * needed for that.
 *
 * `monochromeLogo`: the logo is a black one-colour mark on a transparent
 * ground (Hyperboards). The plate is near-black in dark mode, so this logo
 * flips to white there (`dark:invert`, as the wordmark images do).
 */
export const CONNECTED_APPS = [
  {
    name: "Ma Earth",
    desc: "Collective funding for regenerating Earth",
    longDesc:
      "Ma Earth runs collective funding rounds that direct community support and matching funds to community-led regeneration projects.",
    logo: "/assets/partners/maearth_logo.jpeg",
    url: "https://maearth.com",
  },
  {
    name: "GainForest",
    desc: "Co-creating a fair future for nature stewards",
    longDesc:
      "GainForest develops open nature tech that monitors ecosystems and rewards verifiable conservation outcomes.",
    logo: "/assets/partners/gainforest_logo.png",
    url: "https://gainforest.app",
  },
  {
    name: "Silvi",
    desc: "Reforestation done right",
    longDesc:
      "Silvi connects funders with tree stewards and verifies community-led reforestation through satellite, drone, and on-the-ground monitoring.",
    logo: "/assets/partners/silvi_logo.png",
    url: "https://silvi.earth",
  },
  {
    name: "Simocracy",
    desc: "Democratic governance for the digital age",
    longDesc:
      "Simocracy lets people build AI digital twins of themselves and send them into governance, deliberation, and capital allocation.",
    logo: "/assets/partners/simocracy_logo.png",
    url: "https://simocracy.org",
  },
  {
    name: "Hyperboards",
    desc: "Visualizing and recognizing those who create real value",
    longDesc:
      "Hyperboards turn signed contributor records on AT Protocol into living, embeddable boards that show who built what.",
    logo: "/assets/partners/hyperboards_brandmark.webp",
    monochromeLogo: true,
    url: "https://hyperboards.org",
    // Hyperboards exposes the ePDS handle-login GET endpoint with no
    // `prompt=login`, so passing the viewer's handle silently SSOs them
    // through the Certified PDS session. Appended with
    // `encodeURIComponent(handle)` at render time.
    ssoHandleUrl: "https://hyperboards.org/api/oauth/epds/login?handle=",
  },
] as const;
