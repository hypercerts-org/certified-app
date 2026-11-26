import { IdentityLink } from "@hypercerts-org/ui-react";
import { Suspense } from "react";
import { actorHref, identityOf } from "@/components/actor";
import type { ActorCard } from "@/lib/hypercerts/views";
import { getHandle } from "@/lib/identity";

// A record's author on its page, from the card the record came with (as the
// API has it, without a handle). The page doesn't wait for the handle, which
// takes outside lookups: the link leads to the author's DID at once (which
// redirects to the handle), and to the handle once it is checked. It looks
// the same either way.

/** The author's link: by DID at once, then by its handle once that is checked. */
export function AuthorLink({ author }: { author: ActorCard }) {
  return (
    <Suspense fallback={<IdentityLink {...identityOf(author)} href={actorHref(author)} />}>
      <AuthorLinkWithHandle author={author} />
    </Suspense>
  );
}

async function AuthorLinkWithHandle({ author }: { author: ActorCard }) {
  const handle = author.handle ?? (await getHandle(author.did));
  const card = { ...author, handle };
  return <IdentityLink {...identityOf(card)} href={actorHref(card)} />;
}
