"use client";

import CopyPill from "./copy-pill";

/**
 * The account's DID rendered as a click-to-copy pill (the "Permanent ID"
 * row in Account settings). Thin wrapper over {@link CopyPill}. The DID
 * stays the visible text; the control is named "Copy permanent ID", the
 * same words Home and the profile use.
 */
export default function DidSection({ did }: { did: string | undefined }) {
  return <CopyPill value={did} label="permanent ID" />;
}
