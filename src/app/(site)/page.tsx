import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getUser } from "@/lib/auth/dal";

// `/` with a session cookie (src/proxy.ts sends everyone else to the landing
// page): signed in, your workspace (the one you act as); a stale cookie, the
// landing page.
async function ToStart(): Promise<never> {
  redirect((await getUser()) ? "/workspace" : "/welcome");
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ToStart />
    </Suspense>
  );
}
