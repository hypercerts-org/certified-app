// An account's identifiers, shown the same wherever the app shows them as
// identifiers (the workspace's ID box, the profile's Account card, Settings):
// in full, in the monospace face, with a copy button. Not where an account is
// only named (a feed line, a row): there it is its name (ActorLink).

import { CopyableId } from "@hypercerts-org/ui-react";

/** An account's handle, "@name.example", copied without the "@". */
export function HandleId({ handle, label = "Handle" }: { handle: string; label?: string }) {
  return (
    <CopyableId value={handle} displayValue={`@${handle}`} label={label} className="account-id" />
  );
}

/**
 * An account's permanent ID (its DID), or a record's (its AT-URI): in full,
 * never shortened, so it reads the same everywhere.
 */
export function PermanentId({ value, label = "Permanent ID" }: { value: string; label?: string }) {
  return <CopyableId value={value} displayValue={value} label={label} className="account-id" />;
}
