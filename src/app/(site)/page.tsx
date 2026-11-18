import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getUser } from "@/lib/auth/dal";

// `/`, normally redirected by src/proxy.ts before it renders; this is the
// fallback. Signed in, your workspace (the one you act as);
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
