// A published record's actions on its page, for whoever may change it (the
// account itself, or an organization's admins and owners): the three-dot
// menu (record-menu), with where the record's edit form is. Nothing for
// anyone else.
import { workspaceHref } from "@/components/cards";
import { RecordMenu } from "@/components/record-menu";
import { mayEditAccount } from "@/lib/memberships";

/** Each kind of record this app edits: what it is called, where its form is, what deleting it leaves. */
const KINDS: Record<string, { what: string; form: string; consequence?: string }> = {
  "org.hypercerts.collection": {
    what: "project",
    form: "edit-project",
    consequence: "Its activities stay.",
  },
  "org.hypercerts.claim.activity": {
    what: "activity",
    form: "edit-activity",
    consequence: "Projects that hold it no longer show it.",
  },
};

export async function RecordActions({ uri, title }: { uri: string; title: string }) {
  const [, , did, nsid, rkey] = uri.split("/");
  const kind = KINDS[nsid];
  if (!kind || !did || !rkey || !(await mayEditAccount(did))) return null;
  return (
    <RecordMenu
      what={kind.what}
      title={title}
      editHref={`${workspaceHref(did)}/projects/${kind.form}/${rkey}`}
      consequence={kind.consequence}
    />
  );
}
