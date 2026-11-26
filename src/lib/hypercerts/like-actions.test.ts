import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getOAuthSession,
  mayPublish,
  getIndexedActorLike,
  sdkContext,
  like,
  unlike,
  waitForIndex,
  updateTag,
} = vi.hoisted(() => ({
  getOAuthSession: vi.fn(),
  mayPublish: vi.fn(),
  getIndexedActorLike: vi.fn(),
  sdkContext: vi.fn(),
  like: vi.fn(),
  unlike: vi.fn(),
  waitForIndex: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({ updateTag }));
vi.mock("@hypercerts-org/sdk/social", () => ({ like, unlike }));
vi.mock("@/lib/auth/dal", () => ({ getOAuthSession }));
vi.mock("@/lib/hypercerts/publish-access", () => ({ mayPublish }));
vi.mock("@/lib/hypercerts/queries", () => ({ getIndexedActorLike }));
vi.mock("@/lib/hypercerts/sdk", () => ({
  sdkContext,
  writeTo: (session: { did: string }, repo: string) =>
    repo === session.did ? undefined : { repo },
  writeFailure: () => "unknown",
}));
vi.mock("@/lib/hypercerts/index-wait", () => ({ waitForIndex }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));

import { likeRecord, unlikeRecord } from "./like-actions";

const USER = "did:plc:user11111111111111111111";
const ORG = "did:plc:org222222222222222222222";
const SUBJECT = "at://did:plc:author333333333333333333/org.hypercerts.claim.activity/3k2b";
const LIKE_URI = `at://${USER}/app.certified.feed.like/3k2c`;

describe("likeRecord & unlikeRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOAuthSession.mockResolvedValue({ did: USER });
    mayPublish.mockResolvedValue(true);
    sdkContext.mockResolvedValue({});
    waitForIndex.mockResolvedValue(true);
  });

  it("rejects unauthenticated requests before touching the SDK", async () => {
    getOAuthSession.mockResolvedValue(null);
    const res = await likeRecord({ repo: USER, subject: SUBJECT });
    expect(res).toMatchObject({ ok: false, reason: "signed-out" });
    expect(like).not.toHaveBeenCalled();
  });

  it("rejects liking for an organization when caller lacks publish permission", async () => {
    mayPublish.mockResolvedValue(false);
    const res = await likeRecord({ repo: ORG, subject: SUBJECT });
    expect(res).toMatchObject({ ok: false, reason: "forbidden" });
    expect(like).not.toHaveBeenCalled();
  });

  it("returns existing indexed like without creating a duplicate", async () => {
    getIndexedActorLike.mockResolvedValue({ uri: LIKE_URI, cid: "bafy1" });
    const res = await likeRecord({ repo: USER, subject: SUBJECT });
    expect(res).toEqual({ ok: true, likeUri: LIKE_URI, indexed: true });
    expect(like).not.toHaveBeenCalled();
  });

  it("creates a like via SDK and expires subject and actor like tags", async () => {
    getIndexedActorLike.mockResolvedValue(null);
    like.mockResolvedValue({ uri: LIKE_URI, cid: "bafy2" });
    const res = await likeRecord({ repo: USER, subject: SUBJECT });
    expect(res).toEqual({ ok: true, likeUri: LIKE_URI, indexed: true });
    expect(like).toHaveBeenCalledWith({}, { subject: { uri: SUBJECT } }, undefined);
    expect(updateTag).toHaveBeenCalledWith(`likes:${SUBJECT}`);
    expect(updateTag).toHaveBeenCalledWith(`actor-likes:${USER}`);
  });

  it("removes both known optimistic URIs and indexed likes on unlike", async () => {
    const indexedUri = `at://${USER}/app.certified.feed.like/3k2d`;
    getIndexedActorLike.mockResolvedValue({ uri: indexedUri, cid: "bafy3" });
    unlike.mockResolvedValue(undefined);
    const res = await unlikeRecord({ repo: USER, subject: SUBJECT, uris: [LIKE_URI] });
    expect(res).toEqual({ ok: true, likeUri: null, indexed: true });
    expect(unlike).toHaveBeenCalledTimes(2);
    expect(updateTag).toHaveBeenCalledWith(`likes:${SUBJECT}`);
  });
});
