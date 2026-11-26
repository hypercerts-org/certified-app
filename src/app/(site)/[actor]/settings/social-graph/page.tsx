import { redirect } from "next/navigation";

// Renamed Bluesky sync; old links land there.
export default async function Moved({ params }: PageProps<"/[actor]/settings/social-graph">) {
  redirect(`/${(await params).actor}/settings/bluesky-sync`);
}
