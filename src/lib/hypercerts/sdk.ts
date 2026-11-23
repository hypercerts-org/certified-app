// The Hypercerts SDK, for the writes it covers (follows, so far). It takes
// the signed-in session as is; organizations' writes go through CGS.
import "server-only";

import { Client, type l } from "@atproto/lex";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { createSDKContext, type SDKContext, type WriteOptions } from "@hypercerts-org/sdk";
import { CGS_DID, CGS_URL } from "@/lib/cgs";

export function sdkContext(session: OAuthSession): SDKContext {
  return createSDKContext({
    client: new Client(session),
    cgs: { url: CGS_URL.href, did: CGS_DID as l.DidString },
  });
}

/** Where a write as `actor` goes: the user's own repository, or (through CGS) an organization's. */
export function writeTo(session: OAuthSession, actor: string): WriteOptions | undefined {
  return actor === session.did ? undefined : { repo: actor as l.DidString };
}
