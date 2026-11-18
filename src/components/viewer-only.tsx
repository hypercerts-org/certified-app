import { type ReactNode, Suspense } from "react";
import { getActingAs } from "@/lib/acting-as";

// Public pages are cached and shared by every visitor; only small parts
// depend on who is viewing (the account's own empty sections, "No
// endorsements yet"). These wrappers keep those parts as small per-request
// pieces, so everything around them stays in the cached page and shows at
// once. Each streams in behind its own Suspense boundary, with nothing in its
// place until then.

async function Gate({
  did,
  owner,
  children,
}: {
  did: string;
  owner: boolean;
  children: ReactNode;
}) {
  const isOwner = (await getActingAs()) === did;
  return isOwner === owner ? children : null;
}

/** Shown only to whoever acts as `did`. */
export function OwnerOnly({ did, children }: { did: string; children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate did={did} owner>
        {children}
      </Gate>
    </Suspense>
  );
}

/** Shown to everyone except whoever acts as `did`. */
export function VisitorOnly({ did, children }: { did: string; children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate did={did} owner={false}>
        {children}
      </Gate>
    </Suspense>
  );
}
