// Write guard for preview deployments. Record signing (`createdVia`) will be
// wired in once `@hypercerts-org/sdk` supports it natively.
import "server-only";

import { oauthMode } from "@/lib/auth/config";

/**
 * Refuses writes from preview deployments (`VERCEL_ENV === "preview"` or
 * `*.vercel.app` hosts) so branch previews never mutate live repositories.
 * Local loopback development is allowed.
 */
export function assertWritesAllowed(): void {
  if (process.env.VERCEL_ENV === "preview") {
    throw new Error("Preview deployments don't write records.");
  }
  if (oauthMode().kind === "loopback") return;
  const publicUrl = process.env.PUBLIC_URL?.trim();
  const url = publicUrl ? new URL(publicUrl) : null;
  if (url?.protocol !== "https:" || url.hostname.endsWith(".vercel.app")) {
    throw new Error("Writes need a permanent https PUBLIC_URL, not a preview host.");
  }
}
