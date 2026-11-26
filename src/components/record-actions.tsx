// A published record's actions on its page: Like, Share, Add to list, Copy
// Permanent ID for every visitor, plus Edit and Delete for whoever may change
// it (the account itself, or an organization's admins and owners).
import { workspaceHref } from "@/components/cards";
import { RecordMenu } from "@/components/record-menu";
import { getActingAs } from "@/lib/acting-as";
import { getActorLikesForSubjects, getLikeCounts } from "@/lib/hypercerts/queries";
import type { ListKind } from "@/lib/lists";
import { mayEditAccount } from "@/lib/memberships";

/** Each kind of record this app handles: what it is called, its list kind, where its form is. */
const KINDS: Record<
  string,
  { what: string; listKind: ListKind["label"]; form: string; consequence?: string }
> = {
  "org.hypercerts.collection": {
    what: "project",
    listKind: "Projects",
    form: "edit-project",
    consequence: "Its activities stay.",
  },
  "org.hypercerts.claim.activity": {
    what: "activity",
    listKind: "Activities",
    form: "edit-activity",
    consequence: "Projects that hold it no longer show it.",
  },
};

export async function RecordActions({
  uri,
  path,
  title,
}: {
  uri: string;
  path: string;
  title: string;
}) {
  const [, , did, nsid, rkey] = uri.split("/");
  const kind = KINDS[nsid];
  if (!kind || !did || !rkey) return null;
  const [actor, canEdit, counts] = await Promise.all([
    getActingAs(),
    mayEditAccount(did),
    getLikeCounts([uri]),
  ]);
  const actorLikes = actor ? await getActorLikesForSubjects(actor, [uri]) : {};
  return (
    <RecordMenu
      uri={uri}
      path={path}
      what={kind.what}
      listKind={kind.listKind}
      title={title}
      actor={actor}
      likeCount={counts[uri] ?? 0}
      likeUri={actorLikes[uri] ?? null}
      editHref={canEdit ? `${workspaceHref(did)}/projects/${kind.form}/${rkey}` : null}
      consequence={kind.consequence}
    />
  );
}
