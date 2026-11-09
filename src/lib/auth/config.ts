// OAuth configuration from the environment.
//
// The app is an atproto OAuth client with a backend: the server holds the
// tokens, the browser only gets a session cookie. A deployment with an https
// origin publishes client metadata at /.well-known/oauth-client-metadata. Local
// development on http uses atproto's loopback client instead, which needs no
// published metadata but must be reached on 127.0.0.1.
import "server-only";

/** Certified's PDS. Email sign-in starts its authorization here. */
export const CERTIFIED_PDS_URL = process.env.CERTIFIED_PDS_URL ?? "https://certified.one";

/**
 * `transition:generic` lets the session write any record and request service
 * auth for the Certified Group Service. Narrow it to granular permission
 * scopes once Certified's PDS is known to support them.
 */
export const OAUTH_SCOPE = "atproto transition:generic";

export const CALLBACK_PATH = "/oauth/callback";

export type OAuthMode =
  | { kind: "web"; publicUrl: string }
  | { kind: "loopback"; redirectUri: `http://127.0.0.1:${number}${string}` };

function publicUrl(): string | undefined {
  const explicit = process.env.PUBLIC_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercelHost = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  return vercelHost ? `https://${vercelHost}` : undefined;
}

export function oauthMode(): OAuthMode {
  const url = publicUrl();
  if (url?.startsWith("https://")) return { kind: "web", publicUrl: url };
  if (process.env.NODE_ENV === "production") {
    throw new Error("OAuth needs an https PUBLIC_URL (or VERCEL_URL) in production.");
  }
  const port = Number(url ? new URL(url).port : "") || 3000;
  return { kind: "loopback", redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}` };
}
