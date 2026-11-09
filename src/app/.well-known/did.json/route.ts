import { connection } from "next/server";
import { getAppKey } from "@/lib/atproto/app-key";
import { oauthMode } from "@/lib/auth/config";
import { logError } from "@/lib/log";

// The app's did:web document, which publishes the keys behind its createdVia
// record signatures, retired ones included. Local loopback development signs
// with a did:key and has no document. Only a 200 is cacheable, so a fixed
// misconfiguration doesn't linger.
export async function GET() {
  await connection();
  if (oauthMode().kind === "loopback") return new Response("Not found", { status: 404 });
  let key: Awaited<ReturnType<typeof getAppKey>>;
  try {
    key = await getAppKey();
  } catch (err) {
    logError("[did.json] signing key not configured", err);
    return new Response("Signing key not configured", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return Response.json(
    {
      "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"],
      id: key.did,
      verificationMethod: key.methods.map((method) => ({
        id: method.id,
        type: "Multikey",
        controller: key.did,
        publicKeyMultibase: method.publicKeyMultibase,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
