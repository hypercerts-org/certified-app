import { redirect } from "next/navigation";

// App passwords moved into Settings → Account, under Password; old links
// land there.
export default function AppPasswordsMoved() {
  redirect("/settings");
}
