import { describe, expect, it } from "vitest";
import type { ProfileVersion } from "@/lib/hypercerts/views";
import type { ProfileOperation } from "./local-store";
import {
  needsPdsCheck,
  projectProfile,
  reconcileWithIndex,
  resolveWithPds,
} from "./profile-overlay";

const did = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const uri = `at://${did}/app.certified.actor.profile/self`;
const version = (cid: string, displayName: string): ProfileVersion => ({
  uri,
  cid,
  displayName,
  description: "",
});
const base = { actorDid: did, repoDid: did, expectedCid: "bafyold" };
const submitting = (seq: number, displayName: string): ProfileOperation => ({
  ...base,
  seq,
  id: `op${seq}`,
  state: "submitting",
  submitted: { displayName, description: "" },
});
const unknown = (seq: number, displayName: string): ProfileOperation => ({
  ...submitting(seq, displayName),
  state: "unknown",
});
const saved = (
  seq: number,
  cid: string,
  displayName: string,
  indexed = false,
): ProfileOperation => ({
  ...base,
  seq,
  id: `op${seq}`,
  state: "saved",
  submitted: { displayName, description: "" },
  saved: version(cid, displayName),
  indexed,
});

const rendered = { displayName: "Old name", description: "" };

describe("projectProfile", () => {
  it("shows the rendered profile when this browser has no writes", () => {
    expect(projectProfile(rendered, undefined, [])).toEqual({ fields: rendered, status: null });
  });

  it("shows a save immediately, before the PDS answers", () => {
    expect(projectProfile(rendered, undefined, [submitting(1, "New")])).toMatchObject({
      fields: { displayName: "New" },
      status: "saving",
    });
  });

  it("keeps a saved value while the index still has the old version", () => {
    const display = projectProfile(rendered, version("bafyold", "Old name"), [
      saved(1, "bafynew", "New"),
    ]);
    expect(display).toMatchObject({ fields: { displayName: "New" }, status: "syncing" });
  });

  it("hands off to the index once it shows the saved version", () => {
    const display = projectProfile(rendered, version("bafynew", "New"), [
      saved(1, "bafynew", "New"),
    ]);
    expect(display).toEqual({ fields: { displayName: "New", description: "" }, status: null });
  });

  it("does not let a stale read revert a value the index already showed", () => {
    const display = projectProfile(rendered, version("bafyold", "Old name"), [
      saved(1, "bafynew", "New", true),
    ]);
    expect(display.fields.displayName).toBe("New");
  });

  it("lets the newest operation win over an older saved one", () => {
    const display = projectProfile(rendered, undefined, [
      saved(1, "bafya", "First"),
      submitting(2, "Second"),
    ]);
    expect(display.fields.displayName).toBe("Second");
  });
});

describe("reconcileWithIndex", () => {
  it("marks a saved version indexed when the index shows its exact CID", () => {
    expect(reconcileWithIndex(version("bafynew", "New"), [saved(1, "bafynew", "New")])).toEqual([
      { seq: 1, set: { indexed: true } },
    ]);
  });

  it("does not confirm on the record alone: an update needs the CID", () => {
    expect(reconcileWithIndex(version("bafyold", "New"), [saved(1, "bafynew", "New")])).toEqual([]);
  });

  it("drops operations older than the newest saved one", () => {
    const changes = reconcileWithIndex(null, [unknown(1, "A"), saved(2, "bafyb", "B")]);
    expect(changes).toEqual([{ seq: 1, remove: true }]);
  });
});

describe("PDS checks", () => {
  it("are needed for an unknown outcome", () => {
    expect(needsPdsCheck(undefined, [unknown(1, "New")])).toBe(true);
  });

  it("are needed when the index later shows another version than the saved one", () => {
    const ops = [saved(1, "bafynew", "New", true)];
    expect(needsPdsCheck(version("bafynew", "New"), ops)).toBe(false);
    expect(needsPdsCheck(version("bafyother", "Other"), ops)).toBe(true);
  });

  it("settle an unknown outcome as saved when the PDS holds what was submitted", () => {
    expect(resolveWithPds(version("bafynew", "New"), undefined, [unknown(1, "New")])).toEqual([
      { seq: 1, set: { state: "saved", saved: version("bafynew", "New"), indexed: false } },
    ]);
  });

  it("settle an unknown outcome as lost otherwise, without retrying", () => {
    expect(resolveWithPds(version("bafyold", "Old"), undefined, [unknown(1, "New")])).toEqual([
      { seq: 1, remove: true, lost: true },
    ]);
  });

  it("keep the guard when the PDS still holds the saved version (stale index)", () => {
    const ops = [saved(1, "bafynew", "New", true)];
    expect(resolveWithPds(version("bafynew", "New"), version("bafyold", "Old"), ops)).toEqual([]);
  });

  it("drop the guard when the profile was changed elsewhere", () => {
    const ops = [saved(1, "bafynew", "New", true)];
    expect(
      resolveWithPds(version("bafyother", "Other"), version("bafyother", "Other"), ops),
    ).toEqual([{ seq: 1, remove: true }]);
  });
});
