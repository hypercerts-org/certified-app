import { Card, Heading, Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import Image from "next/image";
import { PageHeader } from "@/components/page-title";
import { APPS } from "@/lib/apps";

export const metadata: Metadata = {
  title: "Apps",
  description: "Apps you can sign in to with your Certified account.",
};

export default function AppsPage() {
  return (
    <div className="page">
      <PageHeader title="Apps" description="Apps you can sign in to with your Certified account." />
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
