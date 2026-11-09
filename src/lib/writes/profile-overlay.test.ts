import { describe, expect, it } from "vitest";
import type { ProfileVersion } from "@/lib/hypercerts/views";
import type { ProfileOperation } from "./local-store";
import {
  pdsQuestion,
  projectProfile,
  reconcileWithIndex,
  resolveWithPds,
  UNKNOWN_CHECKS,
} from "./profile-overlay";

const did = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const uri = `at://${did}/app.certified.actor.profile/self`;
const version = (cid: string, displayName: string): ProfileVersion => ({
  uri,
  cid,
  displayName,
  description: "",
});
const base = (seq: number, displayName: string) => ({
  seq,
  id: `op${seq}`,
  actorDid: did,
  repoDid: did,
  expectedCid: "bafyold",
  submitted: { displayName, description: "" },
});
const submitting = (seq: number, name: string): ProfileOperation => ({
  ...base(seq, name),
  state: "submitting",
});
const unknown = (seq: number, name: string, checks = 0): ProfileOperation => ({
  ...base(seq, name),
  state: "unknown",
  checks,
});
const lost = (seq: number, name: string): ProfileOperation => ({
  ...base(seq, name),
  state: "lost",
});
const saved = (seq: number, cid: string, name: string, indexed = false): ProfileOperation => ({
  ...base(seq, name),
  state: "saved",
  saved: version(cid, name),
  indexed,
});

const rendered = { displayName: "Old name", description: "" };

describe("projectProfile", () => {
  it("shows the rendered profile when there are no local saves", () => {
    expect(projectProfile(rendered, undefined, [])).toMatchObject({
      fields: rendered,
      status: null,
      lost: false,
    });
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
    expect(display).toMatchObject({
      fields: { displayName: "New" },
      status: "syncing",
      savedCid: "bafynew",
    });
  });

  it("hands off to the index once it shows the saved version", () => {
    const display = projectProfile(rendered, version("bafynew", "New"), [
      saved(1, "bafynew", "New"),
    ]);
    expect(display).toMatchObject({ fields: { displayName: "New" }, status: null });
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

  it("shows the index and reports a lost save", () => {
    const display = projectProfile(rendered, version("bafyold", "Old name"), [lost(1, "New")]);
    expect(display).toMatchObject({ fields: { displayName: "Old name" }, lost: true });
  });
});

describe("reconcileWithIndex", () => {
  it("marks a saved version indexed when the index shows its exact CID", () => {
    const op = saved(1, "bafynew", "New");
    expect(reconcileWithIndex(version("bafynew", "New"), [op])).toEqual([
      { seq: 1, next: { ...op, indexed: true } },
    ]);
  });

  it("does not confirm on the fields alone: an update needs the CID", () => {
    expect(reconcileWithIndex(version("bafyold", "New"), [saved(1, "bafynew", "New")])).toEqual([]);
  });

  it("drops operations older than the newest saved one", () => {
    expect(reconcileWithIndex(null, [unknown(1, "A"), saved(2, "bafyb", "B")])).toEqual([
      { seq: 1, remove: true },
    ]);
  });

  it("keeps a saved version that a later lost save didn't replace", () => {
    const ops = [saved(1, "bafya", "A"), lost(2, "B")];
    expect(reconcileWithIndex(null, ops)).toEqual([]);
    expect(projectProfile(rendered, undefined, ops)).toMatchObject({
      lost: true,
      savedCid: "bafya",
    });
  });
});

describe("pdsQuestion", () => {
  it("asks about an unknown outcome, freshly for every check", () => {
    expect(pdsQuestion(undefined, [unknown(1, "New")])).toBe("unknown:op1:0");
    expect(pdsQuestion(undefined, [unknown(1, "New", 1)])).toBe("unknown:op1:1");
  });

  it("does not ask while the index merely lags behind the save", () => {
    expect(pdsQuestion(version("bafyold", "Old"), [saved(1, "bafynew", "New")])).toBeNull();
    expect(pdsQuestion(version("bafynew", "New"), [saved(1, "bafynew", "New")])).toBeNull();
  });

  it("asks when the index shows a third version, before or after indexing", () => {
    expect(pdsQuestion(version("bafyother", "X"), [saved(1, "bafynew", "New")])).toBe(
      "superseded:op1:bafyother",
    );
    expect(pdsQuestion(version("bafyold", "Old"), [saved(1, "bafynew", "New", true)])).toBe(
      "superseded:op1:bafyold",
    );
  });
});

describe("resolveWithPds", () => {
  it("settles an unknown outcome as saved when the PDS moved to the submitted fields", () => {
    const op = unknown(1, "New");
    expect(resolveWithPds(version("bafynew", "New"), [op])).toEqual([
      { seq: 1, next: { ...op, state: "saved", saved: version("bafynew", "New"), indexed: false } },
    ]);
  });

  it("re-reads while the PDS still holds the version the save was based on", () => {
    const op = unknown(1, "New");
    expect(resolveWithPds(version("bafyold", "Old"), [op])).toEqual([
      { seq: 1, next: { ...op, checks: 1 } },
    ]);
  });

  it("declares the save lost after the last re-read, without retrying it", () => {
    const op = unknown(1, "New", UNKNOWN_CHECKS - 1);
    expect(resolveWithPds(version("bafyold", "Old"), [op])).toEqual([
      { seq: 1, next: { ...op, state: "lost" } },
    ]);
  });

  it("declares the save lost when the profile changed elsewhere", () => {
    const op = unknown(1, "New");
    expect(resolveWithPds(version("bafyother", "Other"), [op])).toEqual([
      { seq: 1, next: { ...op, state: "lost" } },
    ]);
  });

  it("keeps the saved row when the PDS still holds it (stale index)", () => {
    expect(resolveWithPds(version("bafynew", "New"), [saved(1, "bafynew", "New", true)])).toEqual(
      [],
    );
  });

  it("gives way to the index when the profile was changed elsewhere", () => {
    expect(resolveWithPds(version("bafyother", "Other"), [saved(1, "bafynew", "New")])).toEqual([
      { seq: 1, remove: true },
    ]);
  });
});
