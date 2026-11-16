import { Skeleton } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { getUser } from "@/lib/auth/dal";
import { signInHref } from "@/lib/validate";

export const metadata: Metadata = { title: "Workspace", robots: { index: false } };

async function ToOwnWorkspace(): Promise<never> {
  const user = await getUser();
  redirect(user ? workspaceHref(user.did) : signInHref("/workspace"));
}

/** `/workspace` opens your own workspace. */
export default function WorkspacePage() {
  return (
    <Suspense fallback={<Skeleton variant="text" lines={3} />}>
      <ToOwnWorkspace />
    </Suspense>
  );
}
