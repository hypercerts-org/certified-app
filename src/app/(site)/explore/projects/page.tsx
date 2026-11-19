import type { Metadata } from "next";
import { ExploreKindPage } from "@/components/explore-page";

export const metadata: Metadata = { title: "Projects · Explore" };

export default function ExploreProjectsPage(props: PageProps<"/explore/projects">) {
  return <ExploreKindPage kind="projects" searchParams={props.searchParams} />;
}
