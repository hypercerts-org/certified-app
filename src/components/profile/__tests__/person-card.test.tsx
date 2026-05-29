import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"

import PersonCard from "../person-card"
import type { AuthorInfo } from "@/hooks/use-author-info"

// quality-012: PersonCard was copy-pasted across profile-endorsements
// and profile-followers (the followers copy is a strict subset of the
// endorsements copy). This test pins the shared, extracted component:
// rendering with/without the optional `note`/`listTitle` rows must
// produce identical name/handle/date rows, and the optional rows must
// only appear when their prop is supplied.

const info: AuthorInfo = {
  did: "did:plc:abc",
  handle: "alice.test",
  displayName: "Alice",
  avatarUrl: null,
}

afterEach(() => {
  cleanup()
})

describe("PersonCard shared row", () => {
  it("renders name, handle and date rows the same with or without optional rows", () => {
    const base = (
      <PersonCard
        did="did:plc:abc"
        info={info}
        isLoadingInfo={false}
        createdAt="2024-01-02T03:04:05.000Z"
      />
    )
    const withExtras = (
      <PersonCard
        did="did:plc:abc"
        info={info}
        isLoadingInfo={false}
        createdAt="2024-01-02T03:04:05.000Z"
        note="Great work"
        listTitle="Core team"
      />
    )

    const a = render(base)
    const aName = a.container.querySelector(
      ".profile-endorsements-v2__card-name",
    )?.textContent
    const aHandle = a.container.querySelector(
      ".profile-endorsements-v2__card-handle",
    )?.textContent
    const aDate = a.container.querySelector(
      ".profile-endorsements-v2__card-date",
    )?.getAttribute("dateTime")
    // Subset surface: no note / list rows when the props are omitted.
    expect(
      a.container.querySelector(".profile-endorsements-v2__card-note"),
    ).toBeNull()
    expect(
      a.container.querySelector(".profile-endorsements-v2__card-list"),
    ).toBeNull()
    cleanup()

    const b = render(withExtras)
    const bName = b.container.querySelector(
      ".profile-endorsements-v2__card-name",
    )?.textContent
    const bHandle = b.container.querySelector(
      ".profile-endorsements-v2__card-handle",
    )?.textContent
    const bDate = b.container.querySelector(
      ".profile-endorsements-v2__card-date",
    )?.getAttribute("dateTime")

    // The three core rows are identical between the two surfaces.
    expect(bName).toBe(aName)
    expect(aName).toBe("Alice")
    expect(bHandle).toBe(aHandle)
    expect(aHandle).toBe("@alice.test")
    expect(bDate).toBe(aDate)
    expect(aDate).toBe("2024-01-02T03:04:05.000Z")

    // Superset surface: the optional rows appear only when supplied.
    expect(
      b.container.querySelector(".profile-endorsements-v2__card-note")
        ?.textContent,
    ).toBe("Great work")
    expect(
      b.container.querySelector(".profile-endorsements-v2__card-list")
        ?.textContent,
    ).toBe("Core team")
  })

  it("renders an action slot in the card menu when `menu` is provided", () => {
    const { container } = render(
      <PersonCard
        did="did:plc:abc"
        info={info}
        isLoadingInfo={false}
        createdAt="2024-01-02T03:04:05.000Z"
        menu={<button type="button">x</button>}
      />,
    )
    const menu = container.querySelector(".profile-endorsements-v2__card-menu")
    expect(menu).not.toBeNull()
    expect(menu?.querySelector("button")).not.toBeNull()
  })
})
