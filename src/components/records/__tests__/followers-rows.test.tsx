import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("kind=followers"),
  usePathname: () => "/records",
}))

vi.mock("@/hooks/use-url-param", () => ({
  useUrlParam: () => ["followers", vi.fn()],
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: (did: string | null) => ({
    info: did ? { did, handle: `${did.slice(8)}.certified.app`, displayName: did.slice(8), avatarUrl: null } : null,
    isLoading: false,
  }),
}))

vi.mock("@/hooks/use-followers", () => ({
  useFollowers: () => ({
    entries: [
      { uri: "at://a/f/1", followerDid: "did:plc:kris", createdAt: "2026-08-31T10:00:00Z" },
      { uri: "at://b/f/2", followerDid: "did:plc:holke", createdAt: "2026-05-22T10:00:00Z" },
    ],
    count: 2,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    addFollower: vi.fn(),
    removeFollower: vi.fn(),
  }),
}))

import WorkspaceShell from "@/components/layout/workspace-shell"
import { FollowersPane } from "../records-panes"

describe("Followers rows (FO1)", () => {
  it("puts every row's button in the same slot after its date, Follow or Following", () => {
    render(
      <WorkspaceShell current="followers">
        <FollowersPane
          did="did:plc:me"
          actor="me.certified.app"
          following={
            {
              subjects: new Set(["did:plc:kris"]),
              records: [],
              count: 1,
              isLoading: false,
              addFollow: vi.fn(),
              removeFollow: vi.fn(),
            } as unknown as Parameters<typeof FollowersPane>[0]["following"]
          }
        />
      </WorkspaceShell>,
    )
    expect(screen.getByRole("link", { name: /kris/ })).toHaveClass("hover-tint", "hover-tint--bleed")
    const following = screen.getByRole("button", { name: "Following kris" })
    const follow = screen.getByRole("button", { name: "Follow holke" })
    for (const button of [following, follow]) {
      const slot = button.closest(".records-person__action")
      expect(slot).not.toBeNull()
      const date = slot!.previousElementSibling
      expect(date).toHaveClass("records-person__since")
    }
  })

  it("gives the slot one width from 800px, right-aligned", () => {
    const css = readFileSync(path.resolve(__dirname, "../../../app/styles/records.css"), "utf8")
    expect(css).toMatch(
      /@media \(min-width: 800px\) \{\s*\.records-person__action \{\s*display: flex;\s*justify-content: flex-end;\s*min-width: [\d.]+rem;/,
    )
  })
})
