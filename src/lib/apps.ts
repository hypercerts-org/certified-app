/** An app built on the same AT Protocol account. */
export type App = {
  name: string;
  /** One line, for compact lists (the workspace overview). */
  tagline: string;
  /** A sentence or two, for the Apps page. */
  description: string;
  logo: string;
  url: string;
};

// Apps built on the same AT Protocol account, in the order shown. To add one,
// put a square logo (about 256px) in public/apps and an entry here.
export const APPS: readonly App[] = [
  {
    name: "Ma Earth",
    tagline: "Collective funding for regenerating Earth",
    description:
      "Ma Earth runs collective funding rounds that direct community support and matching funds to community-led regeneration projects.",
    logo: "/apps/ma-earth.jpeg",
    url: "https://maearth.com",
  },
  {
    name: "GainForest",
    tagline: "Co-creating a fair future for nature stewards",
    description:
      "GainForest develops open nature tech that monitors ecosystems and rewards verifiable conservation outcomes.",
    logo: "/apps/gainforest.png",
    url: "https://gainforest.app",
  },
  {
    name: "Silvi",
    tagline: "Reforestation done right",
    description:
      "Silvi connects funders with tree stewards and verifies community-led reforestation through satellite, drone, and on-the-ground monitoring.",
    logo: "/apps/silvi.png",
    url: "https://silvi.earth",
  },
  {
    name: "Simocracy",
    tagline: "Democratic governance for the digital age",
    description:
      "Simocracy lets people build AI digital twins of themselves and send them into governance, deliberation, and capital allocation.",
    logo: "/apps/simocracy.png",
    url: "https://simocracy.org",
  },
  {
    name: "Hyperboards",
    tagline: "Visualizing and recognizing those who create real value",
    description:
      "Hyperboards turn signed contributor records on AT Protocol into living, embeddable boards that show who built what.",
    logo: "/apps/hyperboards.webp",
    url: "https://hyperboards.org",
  },
];
