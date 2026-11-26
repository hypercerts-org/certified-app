import { redirect } from "next/navigation";

// Moved into the group's Account tab (group-settings-sections); old links land there.
export default async function Moved({ params }: PageProps<"/[actor]/settings/ownership">) {
  redirect(`/${(await params).actor}/settings`);
}
