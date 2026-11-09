import { describe, expect, it } from "vitest";
import type { ProfileVersion } from "@/lib/hypercerts/views";
import type { ProfileOperation } from "./local-store";
import {
  isPending,
  pdsQuestion,
  projectProfile,
  reconcileWithIndex,
  resolveWithPds,
  settleWithPageRead,
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
  it("asks about an unknown outcome, without needing an index read", () => {
    expect(pdsQuestion(undefined, [unknown(1, "New")])).toEqual({
      opId: "op1",
      key: "unknown:op1",
    });
  });

  it("does not ask while the index merely lags behind the save", () => {
    expect(pdsQuestion(version("bafyold", "Old"), [saved(1, "bafynew", "New")])).toBeNull();
    expect(pdsQuestion(version("bafynew", "New"), [saved(1, "bafynew", "New")])).toBeNull();
  });

  it("asks when the index shows a third version, before or after indexing", () => {
    expect(pdsQuestion(version("bafyother", "X"), [saved(1, "bafynew", "New")])).toMatchObject({
      key: "superseded:op1:bafyother",
    });
    expect(
      pdsQuestion(version("bafyold", "Old"), [saved(1, "bafynew", "New", true)]),
    ).toMatchObject({ key: "superseded:op1:bafyold" });
  });
});

describe("resolveWithPds", () => {
  it("settles an unknown outcome as saved when the PDS moved to the submitted fields", () => {
    const op = unknown(1, "New");
    expect(resolveWithPds(version("bafynew", "New"), [op], "op1")).toEqual([
      { seq: 1, next: { ...op, state: "saved", saved: version("bafynew", "New"), indexed: false } },
    ]);
  });

  it("re-reads while the PDS still holds the version the save was based on", () => {
    const op = unknown(1, "New");
    expect(resolveWithPds(version("bafyold", "Old"), [op], "op1")).toEqual([
      { seq: 1, next: { ...op, checks: 1 } },
    ]);
  });

  it("declares the save lost after the last re-read, without retrying it", () => {
    const op = unknown(1, "New", UNKNOWN_CHECKS - 1);
    expect(resolveWithPds(version("bafyold", "Old"), [op], "op1")).toEqual([
      { seq: 1, next: { ...op, state: "lost" } },
    ]);
  });

  it("declares the save lost when the profile changed elsewhere", () => {
    const op = unknown(1, "New");
    expect(resolveWithPds(version("bafyother", "Other"), [op], "op1")).toEqual([
      { seq: 1, next: { ...op, state: "lost" } },
    ]);
  });

  it("keeps the saved row when the PDS still holds it (stale index)", () => {
    expect(
      resolveWithPds(version("bafynew", "New"), [saved(1, "bafynew", "New", true)], "op1"),
    ).toEqual([]);
  });

  it("gives way to the index when the profile was changed elsewhere", () => {
    expect(
      resolveWithPds(version("bafyother", "Other"), [saved(1, "bafynew", "New")], "op1"),
    ).toEqual([{ seq: 1, remove: true }]);
  });
});

describe("settling against newer evidence", () => {
  it("ignores an answer about an operation that is no longer the newest", () => {
    const ops = [saved(1, "bafya", "A"), submitting(2, "B")];
    expect(resolveWithPds(version("bafyold", "Old"), ops, "op1")).toEqual([]);
  });

  it("drops a saved row the page's fresh PDS read has moved past", () => {
    const ops = [saved(1, "bafynew", "New", true)];
    expect(settleWithPageRead(version("bafyother", "Other"), ops)).toEqual([
      { seq: 1, remove: true },
    ]);
    expect(settleWithPageRead(version("bafynew", "New"), ops)).toEqual([]);
  });

  it("does not poll for a lost save", () => {
    expect(isPending(lost(1, "New"))).toBe(false);
    expect(isPending(unknown(1, "New"))).toBe(true);
    expect(isPending(saved(1, "bafynew", "New", true))).toBe(false);
  });
});
