import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getUser } from "@/lib/auth/dal";

// `/`, as on staging: signed in, your workspace (the one you act as);
// otherwise the landing page.
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
