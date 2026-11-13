import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import type { ComponentProps } from "react"

// The description editor is a dynamic TipTap import; a stub keeps the
// form mountable in jsdom.
vi.mock("@/components/leaflet/leaflet-editor-dynamic", () => ({
  default: () => <div data-testid="editor" />,
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null, isLoading: false, error: null }),
}))

vi.mock("@/hooks/use-contributor-info", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-contributor-info")>()
  return {
    ...actual,
    useContributorInfo: () => ({
      info: { did: "did:plc:ada", handle: "ada.test", displayName: "Ada", avatarUrl: null },
      isLoading: false,
    }),
  }
})

import {
  ActivityFormFields,
  activityFormProblems,
  type ContributorRow,
} from "../activity-form"

afterEach(() => cleanup())

const noop = () => {}

function renderForm(
  overrides: Partial<ComponentProps<typeof ActivityFormFields>> = {},
) {
  const props: ComponentProps<typeof ActivityFormFields> = {
    title: "A saved activity",
    onTitleChange: noop,
    shortDescription: "Too short for the minimum.",
    onShortDescriptionChange: noop,
    description: null,
    onDescriptionChange: noop,
    descriptionPlaceholder: "",
    editorDid: "did:plc:me",
    onEditorImageUpload: vi.fn(),
    startDate: "",
    endDate: "",
    onStartDateChange: noop,
    onEndDateChange: noop,
    workScope: "",
    onWorkScopeChange: noop,
    imageUrl: null,
    hasPendingImage: false,
    hasImage: false,
    onImageFile: vi.fn(),
    onImageRemove: noop,
    locations: [],
    onRemoveLocation: noop,
    onAddLocation: noop,
    rights: { options: [], isLoading: false, error: null, retry: noop },
    rightsUri: "",
    onRightsChange: noop,
    contributors: [],
    setContributors: noop,
    selfDid: null,
    ...overrides,
  }
  return render(<ActivityFormFields {...props} />)
}

describe("ActivityFormFields", () => {
  it("labels the title and short description", () => {
    renderForm()
    expect(screen.getByLabelText("Title")).toBeTruthy()
    expect(screen.getByLabelText("Short description")).toBeTruthy()
  })

  it("doesn't flag a saved short description until it is edited", () => {
    const { container } = renderForm()
    expect(container.querySelector(".create-cert__counter--under")).toBeNull()

    fireEvent.change(screen.getByLabelText("Short description"), {
      target: { value: "Still too short." },
    })
    expect(container.querySelector(".create-cert__counter--under")).not.toBeNull()
  })

  it("flags every under-minimum count after a save attempt", () => {
    const { container } = renderForm({ title: "", showAllErrors: true })
    expect(container.querySelectorAll(".create-cert__counter--under")).toHaveLength(2)
  })

  it("hides Rights when there is nothing to pick", () => {
    renderForm()
    expect(screen.queryByText("Rights")).toBeNull()
  })

  it("offers Try again when the rights options fail to load", () => {
    const retry = vi.fn()
    renderForm({
      rights: { options: [], isLoading: false, error: "nope", retry },
    })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalled()
  })

  it("gives each contributor one remove control and a labelled share", () => {
    const contributors: ContributorRow[] = [
      { key: "a", identity: "ada.test", weight: "50", role: "", picked: true },
    ]
    const { container } = renderForm({ contributors })
    expect(screen.getAllByRole("button", { name: /remove/i })).toHaveLength(1)
    expect(
      screen.getByLabelText("Share of contributor 1, in percent"),
    ).toHaveProperty("value", "50")
    expect(container.querySelector("#contributors")).not.toBeNull()
  })
})

describe("activityFormProblems", () => {
  it("lists what blocks a save and the field to focus", () => {
    const result = activityFormProblems({
      title: "Long enough",
      shortDescription: "short",
      startDate: "2024-03-01",
      endDate: "2024-01-01",
      contributors: [],
    })
    expect(result.focus).toBe("shortDescription")
    expect(result.unmet).toEqual([
      "the short description needs at least 100 characters",
      "the end date must be on or after the start date",
    ])
  })
})
