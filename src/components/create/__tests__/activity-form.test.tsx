import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { useState, type ComponentProps } from "react"

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

// The contributor typeahead's search (/api/search-actors): what each test
// sets in `actors` comes back for any query.
let actors: { did: string; handle: string; displayName: string; avatar: null }[] = []
beforeEach(() => {
  actors = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ actors }) })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const noop = () => {}

function renderFormElement(
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
  return <ActivityFormFields {...props} />
}

function renderForm(
  overrides: Partial<ComponentProps<typeof ActivityFormFields>> = {},
) {
  return render(renderFormElement(overrides))
}

/** One contributor row, with state, so typing, picking and checks work. */
function StatefulContributors() {
  const [contributors, setContributors] = useState<ContributorRow[]>([
    { key: "a", identity: "", weight: "", role: "", picked: false },
  ])
  return renderFormElement({ contributors, setContributors })
}

const identityError = () =>
  screen.queryByText(
    "Pick someone from the list, or type a full handle (like name.certified.app).",
  )

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

  // W2: on edit, a published summary under the minimum doesn't block a
  // save of the other fields; changing it brings the minimum back.
  it("on edit, flags a short saved summary only once it is changed", () => {
    const saved = "Too short for the minimum."
    const { container } = renderForm({
      shortDescription: saved,
      savedShortDescription: saved,
      showAllErrors: true,
    })
    expect(container.querySelector(".create-cert__counter--under")).toBeNull()
    expect(screen.getByLabelText("Short description")).not.toHaveAttribute("aria-invalid")
    cleanup()

    const changed = renderForm({
      shortDescription: "Still too short.",
      savedShortDescription: saved,
      showAllErrors: true,
    })
    const summary = screen.getByLabelText("Short description")
    expect(summary).toHaveAttribute("aria-invalid", "true")
    expect(changed.container.querySelectorAll(".create-cert__counter--under")).toHaveLength(1)
  })

  // WS-10: the red counter on a changed summary comes with its reason
  // and the way back.
  it("on edit, says why a changed short summary is flagged", () => {
    const saved = "A published summary, under the minimum."
    const line = () =>
      screen.queryByText(
        "A changed summary needs at least 100 characters. Undo your change to keep the current one.",
      )
    renderForm({ shortDescription: saved, savedShortDescription: saved, showAllErrors: true })
    expect(line()).toBeNull()
    cleanup()

    renderForm({
      shortDescription: "Changed, still short.",
      savedShortDescription: saved,
      showAllErrors: true,
    })
    const summary = screen.getByLabelText("Short description")
    expect(summary.getAttribute("aria-describedby")).toContain(line()!.id)
    cleanup()

    // /create (nothing published) and an empty published summary: the
    // counter alone, there is nothing to undo to.
    renderForm({ shortDescription: "Short.", showAllErrors: true })
    expect(line()).toBeNull()
    cleanup()
    renderForm({ shortDescription: "Short.", savedShortDescription: "", showAllErrors: true })
    expect(line()).toBeNull()
  })

  // WS-03: the main column comes first in the DOM, so the keyboard goes
  // title, summary, description, contributors, then the details.
  it("puts the main column before the details in the DOM", () => {
    const { container } = renderForm()
    const article = container.querySelector(".create-cert") as HTMLElement
    const [first, second] = Array.from(article.children)
    expect(first).toHaveClass("cert-detail__main")
    expect(second).toHaveClass("cert-detail__aside")
    const title = screen.getByLabelText("Title")
    const addImage = screen.getByRole("button", { name: "Add image" })
    const addContributor = screen.getByRole("button", { name: "Add contributor" })
    expect(title.compareDocumentPosition(addContributor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(addContributor.compareDocumentPosition(addImage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  // W6: no "not a handle" error while typing (suggestions may be open);
  // it shows on blur or Enter without a pick, and goes on the next edit.
  // WS-02: Enter waits for the name's search; with no suggestion, the
  // error shows.
  it("checks a typed contributor on blur or Enter, not while typing", async () => {
    render(<StatefulContributors />)
    const field = screen.getByLabelText("Contributor 1: name or handle")
    expect(field).toHaveAttribute("placeholder", "Search by name, or type a handle")

    fireEvent.change(field, { target: { value: "Ada Lovel" } })
    expect(identityError()).toBeNull()
    expect(field).not.toHaveAttribute("aria-invalid")

    fireEvent.blur(field)
    expect(identityError()).not.toBeNull()
    expect(field).toHaveAttribute("aria-invalid", "true")

    // Editing again hides it until the next check.
    fireEvent.change(field, { target: { value: "Ada Lovela" } })
    expect(identityError()).toBeNull()

    fireEvent.keyDown(field, { key: "Enter" })
    await waitFor(() => expect(identityError()).not.toBeNull())
  })

  // WS-02: "Rosa" + Enter with Rosa among the suggestions takes her, as
  // the list on screen suggests, instead of the "not a handle" error.
  it("on Enter, a name with suggestions takes the first one", async () => {
    actors = [
      { did: "did:plc:rosa", handle: "rosa.test", displayName: "Rosa Parks", avatar: null },
      { did: "did:plc:rosa2", handle: "rosalind.test", displayName: "Rosalind", avatar: null },
    ]
    render(<StatefulContributors />)
    const field = screen.getByLabelText("Contributor 1: name or handle")
    fireEvent.change(field, { target: { value: "Rosa" } })
    // Pressed before the search has answered: it waits for it.
    fireEvent.keyDown(field, { key: "Enter" })
    await waitFor(() =>
      expect(screen.queryByLabelText("Contributor 1: name or handle")).toBeNull(),
    )
    expect(identityError()).toBeNull()
    expect(screen.getByLabelText("Contributor 1")).toBeInTheDocument()
  })

  it("on Enter after the suggestions show, takes the first one", async () => {
    actors = [{ did: "did:plc:rosa", handle: "rosa.test", displayName: "Rosa Parks", avatar: null }]
    render(<StatefulContributors />)
    const field = screen.getByLabelText("Contributor 1: name or handle")
    fireEvent.change(field, { target: { value: "Rosa" } })
    await screen.findByRole("option", { name: /Rosa Parks/ })
    fireEvent.keyDown(field, { key: "Enter" })
    expect(screen.queryByLabelText("Contributor 1: name or handle")).toBeNull()
    expect(identityError()).toBeNull()
  })

  // WS-02: the message sits right under the field (before Role and
  // Share), describes it, and the border is the full error colour (CSS).
  it("puts the contributor's error right under the field and links it", () => {
    render(<StatefulContributors />)
    const field = screen.getByLabelText("Contributor 1: name or handle")
    fireEvent.change(field, { target: { value: "Ada Lovel" } })
    fireEvent.blur(field)
    const error = identityError()!
    expect(error.id).toBeTruthy()
    expect(field.getAttribute("aria-describedby")).toBe(error.id)
    expect(error.nextElementSibling).toHaveClass("create-cert__contrib-fields")
    expect(error.previousElementSibling).toHaveAccessibleName("Remove contributor 1")
  })

  it("links a share that isn't a number to its message", () => {
    renderForm({
      contributors: [{ key: "a", identity: "ada.test", weight: "ten", role: "", picked: true }],
    })
    const share = screen.getByLabelText("Share of contributor 1, in percent")
    const message = screen.getByText("Share must be a number (decimals are fine, e.g. 12.5).")
    expect(share.getAttribute("aria-describedby")).toBe(message.id)
  })

  it("flags an unrecognisable contributor after a save attempt", () => {
    renderForm({
      contributors: [{ key: "a", identity: "Ada", weight: "", role: "", picked: false }],
      showAllErrors: true,
    })
    expect(
      screen.getByText(
        "Pick someone from the list, or type a full handle (like name.certified.app).",
      ),
    ).toBeTruthy()
  })

  // Audit FR5: the empty image slot had a pencil in the middle as well as
  // the "Add image" pill; now the pill is its one affordance.
  it("gives the empty image slot one affordance, the Add image pill", () => {
    const { container } = renderForm()
    const slot = container.querySelector(".cert-detail__image") as HTMLElement
    expect(slot.querySelectorAll("button")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Add image" })).toBeTruthy()
    // The only glyph is the pill's own camera.
    expect(slot.querySelectorAll("svg")).toHaveLength(1)
    expect(slot.querySelector("button svg")).not.toBeNull()
    // W18: nothing under it, so it takes the theme-aware control colours
    // (the photo scrim vanished on the dark sunken slot).
    expect(screen.getByRole("button", { name: "Add image" })).toHaveClass(
      "image-edit-overlay__btn--empty",
    )
  })

  it("keeps the photo scrim on the pill once there is an image", () => {
    renderForm({ imageUrl: "blob:x", hasImage: true })
    expect(screen.getByRole("button", { name: "Change image" })).not.toHaveClass(
      "image-edit-overlay__btn--empty",
    )
  })

  // Audit FR4: the time period fields are native date inputs in the Input
  // frame with a lucide calendar, not the browser's glyph alone.
  it("draws the time period as date fields with a calendar icon", () => {
    renderForm({ startDate: "2026-11-01" })
    const start = screen.getByLabelText("Start date") as HTMLInputElement
    const end = screen.getByLabelText("End date") as HTMLInputElement
    for (const field of [start, end]) {
      expect(field.type).toBe("date")
      expect(field.classList.contains("input-date")).toBe(true)
      expect(field.parentElement!.querySelector(".input-date__icon svg")).not.toBeNull()
    }
    expect(start).not.toHaveAttribute("data-empty")
    expect(end).toHaveAttribute("data-empty")
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

  it("on edit, applies the summary minimum only once the summary is changed", () => {
    const base = { title: "Long enough", startDate: "", endDate: "", contributors: [] }
    const saved = "A 77-character summary published before the minimum."
    // Unchanged (whitespace aside): nothing blocks the save.
    expect(
      activityFormProblems({ ...base, shortDescription: `${saved} `, savedShortDescription: saved }),
    ).toEqual({ unmet: [], focus: null })
    // Changed and still short: the minimum applies again.
    expect(
      activityFormProblems({ ...base, shortDescription: "Shorter.", savedShortDescription: saved }).unmet,
    ).toEqual(["the short description needs at least 100 characters"])
    // /create (no saved summary) keeps the rule.
    expect(activityFormProblems({ ...base, shortDescription: saved }).focus).toBe("shortDescription")
    // An empty saved summary is no exemption.
    expect(
      activityFormProblems({ ...base, shortDescription: "", savedShortDescription: "" }).focus,
    ).toBe("shortDescription")
  })
})
