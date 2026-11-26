import { redirect } from "next/navigation";

// Renamed Bluesky sync; old links land there.
export default function Moved() {
  redirect("/settings/bluesky-sync");
}
