"use server";

// Workspace → Lists actions: creating lists with @hypercerts-org/sdk/collection,
// and editing list details, adding/removing items, and deleting lists via
// writes.ts (signed with createdVia, compare-and-swap on CID) until the SDK
// supports collection edits and deletes.

import type { l } from "@atproto/lex";
import { createCollection } from "@hypercerts-org/sdk/collection";
import { updateTag } from "next/cache";
import { getRecordSigner } from "@/lib/atproto/app-key";
import { getOAuthSession } from "@/lib/auth/dal";
import { tags } from "@/lib/hypercerts/cache";
import { waitForIndex } from "@/lib/hypercerts/index-wait";
import { mayPublish } from "@/lib/hypercerts/publish-access";
import { getIndexedList } from "@/lib/hypercerts/queries";
import { parseTarget } from "@/lib/hypercerts/resolve-target";
import { sdkContext, type WriteFailure, writeFailure, writeTo } from "@/lib/hypercerts/sdk";
import {
  addItemsToList,
  deleteCollectionRecord,
  removeItemsFromList,
  repositoryFor,
  resolveAccountProfileRef,
  resolvePublicRecord,
  updateListDetails,
  WriteError,
} from "@/lib/hypercerts/writes";
import { getDid } from "@/lib/identity";
import { fitsList, type ListKind } from "@/lib/lists";
import { workspaceHref } from "@/lib/routes";
import { isAtUri, isDid, isRkey } from "@/lib/validate";

const MAX_DESCRIPTION_LENGTH = 10_000;

const COLLECTION_TYPES: Record<ListKind["label"], string> = {
  Activities: "list:certs",
  Projects: "list:projects",
  Accounts: "list:accounts",
  Endorsements: "list:endorsements",
};

type ListFailure = WriteFailure | "signed-out" | "conflict";
export type ListActionFailed = { ok: false; reason: ListFailure; message: string };

export type CreateListResult = { ok: true; href: string; indexed: boolean } | ListActionFailed;
export type EditListResult = { ok: true; indexed: boolean } | ListActionFailed;
export type AddListItemsResult =
  | {
      ok: true;
      added: number;
      skipped: number;
      /** Lines naming nothing that could be found. */
      unresolved: string[];
      /** Lines naming a record this list doesn't hold (a project in an activities list). */
      wrongKind: string[];
      indexed: boolean;
    }
  | ListActionFailed;
export type RemoveListItemsResult =
  | { ok: true; removed: number; indexed: boolean }
  | ListActionFailed;
export type DeleteListResult = { ok: true; href: string; indexed: boolean } | ListActionFailed;

function listUri(repo: string, rkey: string) {
  return `at://${repo}/org.hypercerts.collection/${rkey}`;
}

function mapError(err: unknown, what: string): { reason: ListFailure; message?: string } {
  if (err instanceof WriteError) {
    return {
      reason: err.reason,
      message: err.reason === "invalid" ? err.message : undefined,
    };
  }
  return { reason: writeFailure(err, what) };
}

function messageFor(reason: ListFailure, action: string): string {
  switch (reason) {
    case "signed-out":
      return `Your session has ended. Sign in again to ${action}.`;
    case "forbidden":
      return `You don't have permission to ${action} for this account.`;
    case "conflict":
      return "This list was changed somewhere else. Reload and try again.";
    case "invalid":
      return `Couldn't ${action} with what was entered.`;
    case "unknown":
      return `We couldn't confirm whether the change succeeded. Reload to check.`;
    case "unavailable":
      return `Couldn't ${action} right now. Please try again.`;
  }
}

function fail(reason: ListFailure, action: string, message?: string): ListActionFailed {
  return { ok: false, reason, message: message ?? messageFor(reason, action) };
}

/** Creates a new typed list (`org.hypercerts.collection`) using the Hypercerts SDK. */
export async function createList(
  repo: string,
  input: { kind: ListKind["label"]; title: string; description?: string },
): Promise<CreateListResult> {
  const collectionType = COLLECTION_TYPES[input?.kind];
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  if (typeof repo !== "string" || !isDid(repo) || !collectionType) {
    return fail("invalid", "create the list");
  }
  if (!title) return fail("invalid", "create the list", "Add a name for the list.");
  if (title.length > 256) {
    return fail("invalid", "create the list", "Name must be 256 characters or fewer.");
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return fail("invalid", "create the list", "Description is too long.");
  }

  try {
    const session = await getOAuthSession();
    if (!session) return fail("signed-out", "create the list");
    if (!(await mayPublish(session, repo))) return fail("forbidden", "create the list");

    const created = await createCollection(
      await sdkContext(session),
      {
        title,
        type: collectionType,
        description: description || undefined,
      },
      writeTo(session, repo),
    );
    const indexed = await waitForIndex(async () => (await getIndexedList(created.uri)) !== null);
    updateTag(tags.projects(repo));
    updateTag(tags.actor(repo));
    const rkey = created.uri.split("/").pop() ?? "";
    return { ok: true, href: `${workspaceHref(repo)}/lists/${rkey}`, indexed };
  } catch (err) {
    const mapped = mapError(err, "create list");
    return fail(mapped.reason, "create the list", mapped.message);
  }
}

/** Updates a list's title and description. */
export async function editList(
  repo: string,
  rkey: string,
  input: { title: string; description: string },
): Promise<EditListResult> {
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  if (typeof repo !== "string" || !isDid(repo) || typeof rkey !== "string" || !isRkey(rkey)) {
    return fail("invalid", "update the list");
  }
  if (!title) return fail("invalid", "update the list", "Add a name for the list.");
  if (title.length > 256) {
    return fail("invalid", "update the list", "Name must be 256 characters or fewer.");
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return fail("invalid", "update the list", "Description is too long.");
  }

  try {
    const session = await getOAuthSession();
    if (!session) return fail("signed-out", "update the list");
    if (!(await mayPublish(session, repo))) return fail("forbidden", "update the list");

    const repository = await repositoryFor(session, repo);
    const saved = await updateListDetails(
      repository,
      rkey,
      { title, description },
      await getRecordSigner(),
    );
    const uri = listUri(repo, rkey);
    const indexed = await waitForIndex(async () => (await getIndexedList(uri))?.cid === saved.cid);
    updateTag(tags.list(uri));
    updateTag(tags.projects(repo));
    updateTag(tags.actor(repo));
    return { ok: true, indexed };
  } catch (err) {
    const mapped = mapError(err, "edit list");
    return fail(mapped.reason, "update the list", mapped.message);
  }
}

/**
 * Resolves a pasted line (handle, DID, Certified URL, or AT-URI) to the
 * record it names, with its value (an account: its profile record).
 */
async function resolveLine(line: string) {
  const parsed = parseTarget(line);
  if (!parsed) return null;
  if (parsed.kind === "uri") return resolvePublicRecord(parsed.uri);
  if (parsed.kind === "record-path") {
    const did = isDid(parsed.actor) ? parsed.actor : await getDid(parsed.actor);
    if (!did) return null;
    return resolvePublicRecord(`at://${did}/${parsed.collection}/${parsed.rkey}`);
  }
  const did = parsed.kind === "did" ? parsed.did : await getDid(parsed.handle);
  if (!did) return null;
  const ref = await resolveAccountProfileRef(did as l.DidString);
  return ref && { ...ref, value: null };
}

/** Adds one or many pasted items (handles, DIDs, Certified URLs, or AT-URIs) to a list. */
export async function addListItems(
  repo: string,
  rkey: string,
  rawLines: string[],
): Promise<AddListItemsResult> {
  if (
    typeof repo !== "string" ||
    !isDid(repo) ||
    typeof rkey !== "string" ||
    !isRkey(rkey) ||
    !Array.isArray(rawLines) ||
    rawLines.length === 0 ||
    rawLines.length > 100 ||
    rawLines.some((line) => typeof line !== "string")
  ) {
    return fail("invalid", "add items");
  }

  try {
    const session = await getOAuthSession();
    if (!session) return fail("signed-out", "add items");
    if (!(await mayPublish(session, repo))) return fail("forbidden", "add items");

    const cleaned = [...new Set(rawLines.map((line) => line.trim()).filter(Boolean))];
    if (cleaned.length === 0) return fail("invalid", "add items", "Paste at least one item.");

    const repository = await repositoryFor(session, repo);
    const list = await repository.getRecord("org.hypercerts.collection" as l.NsidString, rkey);
    if (!list) return fail("invalid", "add items", "This list no longer exists.");

    const resolved = await Promise.all(
      cleaned.map(async (line) => ({ line, record: await resolveLine(line) })),
    );
    const unresolved = resolved.filter((entry) => !entry.record).map((entry) => entry.line);
    // Found, but not what this list holds (an activity pasted into a projects list).
    const wrongKind: string[] = [];
    const refs = resolved.flatMap(({ line, record }) => {
      if (!record) return [];
      if (!fitsList(list.value.type, record.uri, record.value)) {
        wrongKind.push(line);
        return [];
      }
      return [{ uri: record.uri, cid: record.cid }];
    });

    if (refs.length === 0) {
      return { ok: true, added: 0, skipped: 0, unresolved, wrongKind, indexed: true };
    }

    const { stored, added, skipped } = await addItemsToList(
      repository,
      rkey,
      refs,
      await getRecordSigner(),
    );
    const uri = listUri(repo, rkey);
    const indexed =
      added === 0
        ? true
        : await waitForIndex(async () => (await getIndexedList(uri))?.cid === stored.cid);
    if (added > 0) {
      updateTag(tags.list(uri));
      updateTag(tags.projects(repo));
    }
    return { ok: true, added, skipped, unresolved, wrongKind, indexed };
  } catch (err) {
    const mapped = mapError(err, "add list items");
    return fail(mapped.reason, "add items", mapped.message);
  }
}

/** Removes selected item URIs from a list. */
export async function removeListItems(
  repo: string,
  rkey: string,
  uris: string[],
): Promise<RemoveListItemsResult> {
  if (
    typeof repo !== "string" ||
    !isDid(repo) ||
    typeof rkey !== "string" ||
    !isRkey(rkey) ||
    !Array.isArray(uris) ||
    uris.length === 0 ||
    uris.length > 500 ||
    uris.some((uri) => typeof uri !== "string" || !isAtUri(uri))
  ) {
    return fail("invalid", "remove items");
  }

  try {
    const session = await getOAuthSession();
    if (!session) return fail("signed-out", "remove items");
    if (!(await mayPublish(session, repo))) return fail("forbidden", "remove items");

    const repository = await repositoryFor(session, repo);
    const { stored, removed } = await removeItemsFromList(
      repository,
      rkey,
      new Set(uris),
      await getRecordSigner(),
    );
    const uri = listUri(repo, rkey);
    const indexed =
      removed === 0
        ? true
        : await waitForIndex(async () => (await getIndexedList(uri))?.cid === stored.cid);
    if (removed > 0) {
      updateTag(tags.list(uri));
      updateTag(tags.projects(repo));
    }
    return { ok: true, removed, indexed };
  } catch (err) {
    const mapped = mapError(err, "remove list items");
    return fail(mapped.reason, "remove items", mapped.message);
  }
}

/** Deletes a list record from `repo`. The items themselves are untouched. */
export async function deleteList(repo: string, rkey: string): Promise<DeleteListResult> {
  if (typeof repo !== "string" || !isDid(repo) || typeof rkey !== "string" || !isRkey(rkey)) {
    return fail("invalid", "delete the list");
  }

  try {
    const session = await getOAuthSession();
    if (!session) return fail("signed-out", "delete the list");
    if (!(await mayPublish(session, repo))) return fail("forbidden", "delete the list");

    const repository = await repositoryFor(session, repo);
    await deleteCollectionRecord(repository, rkey);
    const uri = listUri(repo, rkey);
    const indexed = await waitForIndex(async () => (await getIndexedList(uri)) === null);
    updateTag(tags.list(uri));
    updateTag(tags.projects(repo));
    updateTag(tags.actor(repo));
    return { ok: true, href: `${workspaceHref(repo)}/lists`, indexed };
  } catch (err) {
    const mapped = mapError(err, "delete list");
    return fail(mapped.reason, "delete the list", mapped.message);
  }
}
