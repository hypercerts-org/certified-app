interface DidDocument {
  id: string;
  alsoKnownAs?: string[];
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
}

const DID_FETCH_TIMEOUT_MS = 5000

/**
 * Construct the URL for a DID document and fetch it with a timeout.
 * Shared by resolveHandle and resolvePdsUrl.
 */
async function fetchDidDocument(did: string): Promise<DidDocument | null> {
  let url: string;

  if (did.startsWith("did:plc:")) {
    url = `https://plc.directory/${did}`;
  } else if (did.startsWith("did:web:")) {
    const withoutPrefix = did.slice("did:web:".length);
    const parts = withoutPrefix.split(":");
    const domain = parts[0];
    const path = parts.length > 1 ? parts.slice(1).join("/") : ".well-known";
    url = `https://${domain}/${path}/did.json`;
  } else {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DID_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) return null;

  try {
    return (await response.json()) as DidDocument;
  } catch {
    return null;
  }
}

/**
 * Resolves a DID to its handle from the DID document's alsoKnownAs field.
 * The handle is extracted from the `at://` URI in alsoKnownAs.
 */
export async function resolveHandle(did: string): Promise<string | null> {
  try {
    const doc = await fetchDidDocument(did);
    if (!doc || !Array.isArray(doc.alsoKnownAs)) return null;

    const atUri = doc.alsoKnownAs.find((aka) => typeof aka === "string" && aka.startsWith("at://"));
    if (!atUri) return null;

    return atUri.replace("at://", "");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    console.warn(`resolveHandle failed for ${did}:`, err);
    return null;
  }
}

/**
 * Resolves a DID to its PDS service endpoint URL by fetching the DID document.
 *
 * - For `did:plc:` DIDs, fetches from `https://plc.directory/{did}`
 * - For `did:web:` DIDs, fetches from `https://{domain}/.well-known/did.json`
 *
 * @param did - The DID to resolve (e.g. "did:plc:abc123")
 * @returns The PDS service endpoint URL, or null if resolution fails
 */
export async function resolvePdsUrl(did: string): Promise<string | null> {
  try {
    const doc = await fetchDidDocument(did);
    if (!doc || !Array.isArray(doc.service)) return null;

    const pdsService = doc.service.find((s) =>
      typeof s.id === "string" && (s.id === "#atproto_pds" || s.id.endsWith("#atproto_pds"))
    );

    if (!pdsService) return null;

    if (!pdsService.serviceEndpoint || typeof pdsService.serviceEndpoint !== "string") {
      return null;
    }

    return pdsService.serviceEndpoint;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    console.warn(`resolvePdsUrl failed for ${did}:`, err);
    return null;
  }
}
