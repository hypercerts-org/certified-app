import { Card, Heading, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Apps",
  description: "Apps you can sign in to with your Certified account.",
};

// Apps built on the same AT Protocol account, in the order shown. To add one,
// put a square logo (about 256px) in public/apps and an entry here.
const APPS = [
  {
    name: "Ma Earth",
    description:
      "Ma Earth runs collective funding rounds that direct community support and matching funds to community-led regeneration projects.",
    logo: "/apps/ma-earth.jpeg",
    url: "https://maearth.com",
  },
  {
    name: "GainForest",
    description:
      "GainForest develops open nature tech that monitors ecosystems and rewards verifiable conservation outcomes.",
    logo: "/apps/gainforest.png",
    url: "https://gainforest.app",
  },
  {
    name: "Silvi",
    description:
      "Silvi connects funders with tree stewards and verifies community-led reforestation through satellite, drone, and on-the-ground monitoring.",
    logo: "/apps/silvi.png",
    url: "https://silvi.earth",
  },
  {
    name: "Simocracy",
    description:
      "Simocracy lets people build AI digital twins of themselves and send them into governance, deliberation, and capital allocation.",
    logo: "/apps/simocracy.png",
    url: "https://simocracy.org",
  },
  {
    name: "Hyperboards",
    description:
      "Hyperboards turn signed contributor records on AT Protocol into living, embeddable boards that show who built what.",
    logo: "/apps/hyperboards.webp",
    url: "https://hyperboards.org",
  },
];

export default function AppsPage() {
  return (
    <div className="page">
      <div className="stack">
        <Heading level={1} size="display-3">
          Apps
        </Heading>
        <Text tone="muted">Apps you can sign in to with your Certified account.</Text>
      </div>
      <ul className="grid">
        {APPS.map((app) => (
          <Card as="li" variant="panel" className="card" key={app.name}>
            <a href={app.url} target="_blank" rel="noopener noreferrer" className="app-link">
              <Image src={app.logo} alt="" width={44} height={44} className="app-logo" />
              <Heading level={2} size="heading">
                {app.name}
              </Heading>
              <span className="visually-hidden">(opens in a new tab)</span>
            </a>
            <Text size="body-sm" tone="muted">
              {app.description}
            </Text>
          </Card>
        ))}
      </ul>
    </div>
  );
}
