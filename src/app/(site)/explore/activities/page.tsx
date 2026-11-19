import type { Metadata } from "next";
import { ExploreKindPage } from "@/components/explore-page";

export const metadata: Metadata = { title: "Activities · Explore" };

export default function ExploreActivitiesPage(props: PageProps<"/explore/activities">) {
  return <ExploreKindPage kind="activities" searchParams={props.searchParams} />;
}
