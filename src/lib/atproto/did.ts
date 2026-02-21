interface DidDocument {
  id: string;
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
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
    let url: string;

    if (did.startsWith("did:plc:")) {
      url = `https://plc.directory/${did}`;
    } else if (did.startsWith("did:web:")) {
      // did:web:example.com  → https://example.com/.well-known/did.json
      // did:web:example.com:path:to → https://example.com/path/to/did.json
      const withoutPrefix = did.slice("did:web:".length);
      const parts = withoutPrefix.split(":");
      const domain = parts[0];
      const path =
        parts.length > 1
          ? parts.slice(1).join("/")
          : ".well-known";
      url = `https://${domain}/${path}/did.json`;
    } else {
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return null;
    }

    let doc: DidDocument;
    try {
      doc = (await response.json()) as DidDocument;
    } catch {
      return null;
    }

    if (!Array.isArray(doc.service)) {
      return null;
    }

    const pdsService = doc.service.find((s) =>
      s.id === "#atproto_pds" || s.id.endsWith("#atproto_pds")
    );

    if (!pdsService) {
      return null;
    }

    if (!pdsService.serviceEndpoint || typeof pdsService.serviceEndpoint !== "string") {
      return null;
    }

    return pdsService.serviceEndpoint;
  } catch {
    return null;
  }
}
