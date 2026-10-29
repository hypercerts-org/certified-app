export async function register() {
  // Install the SSRF guard (TECH-811) before any request is handled, so
  // src/lib/atproto/did.ts finds it in its process-wide slot even on routes
  // that never import the guard themselves. Node runtime only: it uses
  // node:dns and an undici dispatcher.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/security/ssrf")
  }
}
