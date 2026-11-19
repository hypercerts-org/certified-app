import type { Metadata } from "next";
import { ExploreAll } from "@/components/explore-page";

export const metadata: Metadata = {
  title: "Explore",
  description: "Activities, projects and accounts across the Certified network.",
};

export default function ExplorePage(props: PageProps<"/explore">) {
  return <ExploreAll searchParams={props.searchParams} />;
}
