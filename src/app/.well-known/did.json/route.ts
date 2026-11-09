import { connection } from "next/server";
import { getAppKey } from "@/lib/atproto/app-key";

// The app's did:web document, which publishes the key behind its createdVia
// record signatures. Local loopback development signs with a did:key and has
// no document.
export async function GET() {
  await connection();
  const key = await getAppKey().catch(() => null);
  if (!key?.did.startsWith("did:web:")) return new Response("Not found", { status: 404 });
  return Response.json(
    {
      "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"],
      id: key.did,
      verificationMethod: [
        {
          id: key.keyId,
          type: "Multikey",
          controller: key.did,
          publicKeyMultibase: key.publicKeyMultibase,
        },
      ],
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
