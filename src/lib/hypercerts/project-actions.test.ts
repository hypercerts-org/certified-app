import type { OAuthSession } from "@atproto/oauth-client-node";
import { WriteOutcomeUnknownError } from "@hypercerts-org/sdk/project";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDraft } from "./project-actions";

vi.mock("server-only", () => ({}));

const mocks = {
  getOAuthSession: vi.fn<() => Promise<OAuthSession | null>>(),
  mayPublish: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  createProject: vi.fn(),
  projectIndexed: vi.fn(),
  waitForIndex: vi.fn(),
  updateTag: vi.fn(),
};

vi.mock("next/cache", () => ({ updateTag: (...args: unknown[]) => mocks.updateTag(...args) }));
vi.mock("@/lib/auth/dal", () => ({
  getOAuthSession: () => mocks.getOAuthSession(),
  SessionUnavailableError: class SessionUnavailableError extends Error {},
}));
vi.mock("@/lib/hypercerts/publish-access", () => ({
  mayPublish: (...args: unknown[]) => mocks.mayPublish(...args),
}));
vi.mock("@/lib/hypercerts/index-wait", () => ({
  waitForIndex: (check: () => Promise<boolean>) => mocks.waitForIndex(check),
}));
vi.mock("@/lib/hypercerts/queries", () => ({
  projectIndexed: (...args: unknown[]) => mocks.projectIndexed(...args),
}));
vi.mock("@hypercerts-org/sdk/project", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hypercerts-org/sdk/project")>();
  return { ...actual, createProject: (...args: unknown[]) => mocks.createProject(...args) };
});

const { publishProject } = await import("./project-actions");

const USER = "did:plc:user11111111111111111111";
const ORG = "did:plc:org111111111111111111111";
const OTHER = "did:plc:othr11111111111111111111";
const FAKE_SESSION = { did: USER, fetchHandler: vi.fn() } as unknown as OAuthSession;

const baseDraft = (overrides: Partial<ProjectDraft> = {}): ProjectDraft => ({
  title: "Watershed restoration",
  shortDescription: "Restoring highland streams.",
  description: "",
  banner: null,
  activities: [],
  location: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOAuthSession.mockResolvedValue(FAKE_SESSION);
  mocks.mayPublish.mockResolvedValue(true);
  mocks.waitForIndex.mockResolvedValue(true);
  mocks.createProject.mockResolvedValue({
    uri: `at://${ORG}/org.hypercerts.collection/proj1`,
    cid: "bafyproj",
  });
});

describe("publishProject", () => {
  it("rejects foreign or malformed activity URIs and empty shortDescription with no activities", async () => {
    const foreign = await publishProject(
      USER,
      baseDraft({
        shortDescription: "",
        activities: [`at://${OTHER}/org.hypercerts.claim.activity/a1`],
      }),
    );
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.fields?.activities).toBeDefined();

    const noDesc = await publishProject(USER, baseDraft({ shortDescription: "", activities: [] }));
    expect(noDesc.ok).toBe(false);
    if (!noDesc.ok) expect(noDesc.fields?.shortDescription).toBeDefined();
    expect(mocks.getOAuthSession).not.toHaveBeenCalled();
  });

  it("publishes via SDK for an organization and expires project, activity, actor, and explore tags", async () => {
    const ownActivity = `at://${ORG}/org.hypercerts.claim.activity/a1`;
    const res = await publishProject(
      ORG,
      baseDraft({
        shortDescription: "",
        activities: [ownActivity],
        location: { kind: "new", name: "Mt Elgon", point: { lat: 1.1, lng: 34.5 } },
      }),
    );

    expect(res).toEqual({
      ok: true,
      href: `/${ORG}/project/proj1`,
      indexed: true,
    });
    expect(mocks.mayPublish).toHaveBeenCalledWith(FAKE_SESSION, ORG);
    expect(mocks.createProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Watershed restoration",
        activities: [{ activity: { uri: ownActivity } }],
      }),
      { repo: ORG },
    );
    expect(mocks.updateTag.mock.calls.flat()).toEqual([
      `projects:${ORG}`,
      `activities:${ORG}`,
      `actor:${ORG}`,
      "explore",
      `locations:${ORG}`,
    ]);
  });

  it("maps forbidden and unknown SDK failures cleanly", async () => {
    mocks.mayPublish.mockResolvedValueOnce(false);
    const forbidden = await publishProject(ORG, baseDraft());
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.message).toContain("member");

    mocks.createProject.mockRejectedValueOnce(new WriteOutcomeUnknownError("createProject", []));
    const unknown = await publishProject(USER, baseDraft());
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.message).toContain("couldn't confirm");
  });
});
