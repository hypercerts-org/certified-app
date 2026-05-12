/**
 * Partner apps surfaced on the /apps directory page. Add a new entry
 * by dropping a square logo (~256px) into public/assets/partners and
 * referencing it here. Order in this list is the order rendered.
 */
export const CONNECTED_APPS = [
  {
    name: "Ma Earth",
    desc: "Collective funding for regenerating Earth",
    longDesc:
      "Ma Earth connects communities with regenerative projects, enabling transparent funding and impact tracking through hypercerts.",
    logo: "/assets/partners/maearth_logo.jpeg",
    url: "https://maearth.com",
  },
  {
    name: "GainForest",
    desc: "Co-creating a fair future for nature stewards",
    longDesc:
      "GainForest uses AI and blockchain to monitor forests and reward conservation efforts with verifiable impact certificates.",
    logo: "/assets/partners/gainforest_logo.jpeg",
    url: "https://gainforest.earth",
  },
  {
    name: "Silvi",
    desc: "Reforestation done right",
    longDesc:
      "Silvi enables community-led reforestation by combining satellite imagery, drone mapping, and ground verification to track plantings transparently and connect funders directly with tree stewards.",
    logo: "/assets/partners/silvi_logo.png",
    url: "https://silvi.earth",
  },
  {
    name: "Simocracy",
    desc: "Democratic governance for the digital age",
    longDesc:
      "Simocracy enables transparent democratic decision-making with verifiable identity and portable civic participation records.",
    logo: "/assets/partners/simocracy_logo.jpg",
    url: "https://simocracy.org",
  },
  {
    name: "Hyperboards",
    desc: "Visualizing and recognizing those who create real value",
    longDesc:
      "Hyperboards creates leaderboards and visual displays of hypercerts holders, making impact contributions visible and shareable.",
    logo: "/assets/partners/hyperboards_brandmark.webp",
    url: "https://hyperboards.org",
  },
] as const;
