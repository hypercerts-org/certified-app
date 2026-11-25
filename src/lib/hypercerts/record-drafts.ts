// An existing activity or project as its edit form starts: the record read
// from its repository (the authoritative copy, not the index's), turned into
// the form's values. Editing and deleting themselves wait for the Hypercerts
// SDK (TECH-956): the forms open filled in, and Save stays disabled.
//
// Some stored values are in a shape the forms can't show (a description
// written as a Leaflet document, a work scope as a CEL expression, a
// contributor linked as a record of its own): the forms say these are kept as
// they are (`Kept`). Everything this app knows about the records' raw shape
// for editing is here.
import "server-only";

import type { LexMap, l } from "@atproto/lex";
import * as activity from "@hypercerts-org/lexicon/org/hypercerts/claim/activity";
import * as collection from "@hypercerts-org/lexicon/org/hypercerts/collection";
import * as defs from "@hypercerts-org/lexicon/org/hypercerts/defs";
import type { ActivityDraft } from "@/lib/hypercerts/activity-actions";
import type { ProjectDraft } from "@/lib/hypercerts/project-actions";
import { getActor, getPlace } from "@/lib/hypercerts/queries";
import { imageUrl } from "@/lib/hypercerts/views";
import type { Repository } from "@/lib/hypercerts/writes";
import type { LocationChoice } from "@/lib/location-choice";

const ACTIVITY = activity.main.$type;
const COLLECTION = collection.main.$type;

/** What the forms can't show of a record, kept as stored on save. */
export type Kept = {
  /** The description is in another format (such as a Leaflet document). */
  description: boolean;
  /** The work scope is an expression (CEL), not text. */
  workScope: boolean;
  /** Contributors linked as records of their own. */
  contributors: number;
  /** Locations after the first (the form edits one). */
  locations: number;
};

/** A stored record, as read for editing. */
type Stored = { uri: string; cid: string; value: LexMap };

type StrongRef = { uri: string; cid: string };

const uriOf = (repo: string, collectionNsid: string, rkey: string) =>
  `at://${repo}/${collectionNsid}/${rkey}`;
const typeOf = (value: unknown) =>
  typeof value === "object" && value !== null ? (value as { $type?: unknown }).$type : undefined;
const isRef = (value: unknown): value is StrongRef =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as StrongRef).uri === "string" &&
  typeof (value as StrongRef).cid === "string";

/** The record `collectionNsid/rkey` of `repo`, from its repository; null when there is none. */
async function readRecord(
  repo: Repository,
  collectionNsid: l.NsidString,
  rkey: string,
): Promise<Stored | null> {
  const found = await repo.getRecord(collectionNsid, rkey);
  return found ? { uri: uriOf(repo.did, collectionNsid, rkey), ...found } : null;
}

const readActivity = (repo: Repository, rkey: string) => readRecord(repo, ACTIVITY, rkey);
const readProject = (repo: Repository, rkey: string) => readRecord(repo, COLLECTION, rkey);

// Reading a record into a form ----------------------------------------------

/** A description the form edits as text: a plain string or a descriptionString; else null. */
function descriptionText(value: unknown): string | null {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeOf(value) === defs.descriptionString.$type) {
    const text = (value as { value?: unknown }).value;
    return typeof text === "string" ? text : null;
  }
  return null;
}

/** A work scope the form edits as text; else null. */
function workScopeText(value: unknown): string | null {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeOf(value) === activity.workScopeString.$type) {
    const scope = (value as { scope?: unknown }).scope;
    return typeof scope === "string" ? scope : null;
  }
  return null;
}

/** A contributor the form edits as a row: identity and role inline; else null. */
function inlineContributor(
  entry: unknown,
): { identity: string; role: string; share: string } | null {
  const e = entry as {
    contributorIdentity?: unknown;
    contributionDetails?: unknown;
    contributionWeight?: unknown;
  };
  if (typeOf(e?.contributorIdentity) !== activity.contributorIdentity.$type) return null;
  const identity = (e.contributorIdentity as { identity?: unknown }).identity;
  if (typeof identity !== "string") return null;
  let role = "";
  if (e.contributionDetails !== undefined) {
    if (typeOf(e.contributionDetails) !== activity.contributorRole.$type) return null;
    const stored = (e.contributionDetails as { role?: unknown }).role;
    if (typeof stored !== "string") return null;
    role = stored;
  }
  const share = typeof e.contributionWeight === "string" ? e.contributionWeight : "";
  return { identity, role, share };
}

const day = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";

/** The activity's fields as the form holds them, and what it keeps as stored. */
export function activityFields(value: LexMap) {
  const description = descriptionText(value.description);
  const workScope = workScopeText(value.workScope);
  const entries = Array.isArray(value.contributors) ? value.contributors : [];
  const rows = entries.map(inlineContributor);
  const locations = Array.isArray(value.locations) ? value.locations.filter(isRef) : [];
  const kept: Kept = {
    description: description === null,
    workScope: workScope === null,
    contributors: rows.filter((row) => row === null).length,
    locations: Math.max(0, locations.length - 1),
  };
  return {
    fields: {
      title: typeof value.title === "string" ? value.title : "",
      shortDescription: typeof value.shortDescription === "string" ? value.shortDescription : "",
      description: description ?? "",
      startDate: day(value.startDate),
      endDate: day(value.endDate),
      workScope: workScope ?? "",
      contributors: rows.filter((row) => row !== null),
    },
    /** The first location's URI, if any (the form shows it as a saved place). */
    location: locations[0]?.uri ?? null,
    kept,
  };
}

/** The project's fields as the form holds them, and what it keeps as stored. */
export function projectFields(value: LexMap) {
  const description = descriptionText(value.description);
  const items = Array.isArray(value.items) ? value.items : [];
  const activities = items
    .map((item) => (item as { itemIdentifier?: unknown }).itemIdentifier)
    .filter(isRef)
    .map((ref) => ref.uri)
    .filter((uri) => uri.includes(`/${ACTIVITY}/`));
  return {
    fields: {
      title: typeof value.title === "string" ? value.title : "",
      shortDescription: typeof value.shortDescription === "string" ? value.shortDescription : "",
      description: description ?? "",
      activities,
    },
    location: isRef(value.location) ? value.location.uri : null,
    keptDescription: description === null,
  };
}

// The forms' starting values -------------------------------------------------

/** A location record as the picker's chosen place, named as the index reads it. */
async function chosenPlace(uri: string | null): Promise<LocationChoice | null> {
  if (!uri) return null;
  const place = await getPlace(uri).catch(() => null);
  return {
    kind: "saved",
    uri,
    name: place?.name ?? "A saved location",
    point: place?.point ?? null,
  };
}

/**
 * Activity `rkey` of `repo` as the activity form edits it: the version read,
 * its values (contributors' DIDs shown as handles where they have one), and
 * what the form keeps as stored. Null when there is no such activity.
 */
export async function activityForEditing(repo: Repository, rkey: string) {
  const stored = await readActivity(repo, rkey);
  if (!stored) return null;
  const { fields, location, kept } = activityFields(stored.value);
  const contributors = await Promise.all(
    fields.contributors.map(async (row) => {
      if (!row.identity.startsWith("did:")) return row;
      const actor = await getActor(row.identity).catch(() => null);
      return { ...row, identity: actor?.handle ?? row.identity };
    }),
  );
  const picture = imageUrl(repo.did, stored.value.image, "card");
  const initial: ActivityDraft = {
    ...fields,
    contributors,
    image: picture ? { kept: picture } : null,
    location: await chosenPlace(location),
  };
  return { uri: stored.uri, cid: stored.cid, initial, kept };
}

/**
 * Project `rkey` of `repo` as the project form edits it; null when there is
 * no such project.
 */
export async function projectForEditing(repo: Repository, rkey: string) {
  const stored = await readProject(repo, rkey);
  if (!stored) return null;
  const { fields, location, keptDescription } = projectFields(stored.value);
  const picture = imageUrl(repo.did, stored.value.banner, "banner");
  const initial: ProjectDraft = {
    ...fields,
    banner: picture ? { kept: picture } : null,
    location: await chosenPlace(location),
  };
  return { uri: stored.uri, cid: stored.cid, initial, keptDescription };
}
