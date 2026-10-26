"use client";

import CopyPill from "./copy-pill";

/**
 * The account's DID rendered as a click-to-copy pill (the stable identifier
 * above the username in Account settings). Thin wrapper over {@link CopyPill}.
 * The DID stays the visible text; the control is named "Copy account ID"
 * (plain-language label for the DID).
 */
export default function DidSection({ did }: { did: string | undefined }) {
  return <CopyPill value={did} label="account ID" />;
}
