import type { Metadata } from "next";
import { ExploreKindPage } from "@/components/explore-page";

export const metadata: Metadata = { title: "Accounts · Explore" };

export default function ExploreAccountsPage(props: PageProps<"/explore/accounts">) {
  return <ExploreKindPage kind="accounts" searchParams={props.searchParams} />;
}
