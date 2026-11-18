import NetworkStatsView from "@/components/landing/network-stats-view";
import { getNetworkCounts } from "@/lib/hypercerts/queries";

const count = (value: { value: number; capped: boolean } | null) =>
  value ?? { value: null, capped: false };

/** The network's size, from the API, cached for hours ("—" for a count that failed). */
export default async function NetworkStats() {
  const counts = await getNetworkCounts();
  return (
    <NetworkStatsView
      items={[
        { key: "people", label: "People", ...count(counts.people) },
        { key: "organizations", label: "Organizations", ...count(counts.organizations) },
        { key: "projects", label: "Projects", ...count(counts.projects) },
        { key: "activities", label: "Activities", ...count(counts.activities) },
        { key: "endorsements", label: "Endorsements", ...count(counts.endorsements) },
      ]}
    />
  );
}
