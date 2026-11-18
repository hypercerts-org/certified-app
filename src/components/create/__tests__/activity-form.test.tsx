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

  // C5: one rule for every form: no red while typing; the error shows
  // once the field is left (or after a save attempt), then follows the
  // typing live.
  // The summary follows the lexicon: required, up to 300, no minimum.
  it("accepts any non-empty short description and never shows red while typing", () => {
    const { container } = renderForm()
    const summary = screen.getByLabelText("Short description")
    fireEvent.change(summary, { target: { value: "Short." } })
    fireEvent.blur(summary)
    expect(container.querySelector(".create-cert__counter--under")).toBeNull()
    expect(summary).not.toHaveAttribute("aria-invalid")
    const count = document.getElementById(summary.getAttribute("aria-describedby")!.split(" ")[0])
    expect(count).toHaveTextContent("6/300")
    expect(count).not.toHaveTextContent("min.")
  })

  it("keeps the title's count grey while typing, red once left short, live after", () => {
    function StatefulTitle() {
      const [title, setTitle] = useState("")
      return renderFormElement({ title, onTitleChange: setTitle })
    }
    const { container } = render(<StatefulTitle />)
    const title = screen.getByLabelText("Title")
    const under = () => container.querySelector(".create-cert__field--title .create-cert__counter--under")
    fireEvent.change(title, { target: { value: "Ab" } })
    expect(under()).toBeNull()
    fireEvent.blur(title)
    expect(under()).not.toBeNull()
    fireEvent.change(title, { target: { value: "Abcdef" } })
    expect(under()).toBeNull()
    fireEvent.change(title, { target: { value: "Abc" } })
    expect(under()).not.toBeNull()
  })

  // C11: a page form doesn't take focus on load (the skip link and the
  // navigation come first).
  it("doesn't autofocus the title", () => {
    renderForm()
    expect(document.activeElement).not.toBe(screen.getByLabelText("Title"))
  })

  // C8: optional fields say so in their labels, not in placeholders.
  it("marks the optional fields in their labels", () => {
    renderForm({
      contributors: [{ key: "a", identity: "ada.test", weight: "", role: "", picked: true }],
    })
    expect(screen.getByLabelText("Work scope (optional)")).toBeInTheDocument()
    expect(screen.getByText("Time period (optional)")).toBeInTheDocument()
    expect(screen.getByText("Locations (optional)")).toBeInTheDocument()
    const role = screen.getByLabelText("Role of contributor 1 (optional)")
    expect(role).not.toHaveAttribute("placeholder")
    expect(screen.getByLabelText("Share of contributor 1 in percent (optional)")).not.toHaveAttribute(
      "placeholder",
    )
  })

  it("flags an empty title and an empty summary after a save attempt", () => {
    const { container } = renderForm({ title: "", shortDescription: "", showAllErrors: true })
    expect(container.querySelectorAll(".create-cert__counter--under")).toHaveLength(2)
    expect(screen.getByText("Add a short description.")).toBeInTheDocument()
  })

  // With no minimum, editing a short published summary never blocks a save.
  it("on edit, a short summary is fine, changed or not", () => {
    const saved = "Short."
    const { container } = renderForm({
      shortDescription: "Shorter",
      savedShortDescription: saved,
      showAllErrors: true,
    })
    expect(container.querySelector(".create-cert__counter--under")).toBeNull()
    expect(screen.getByLabelText("Short description")).not.toHaveAttribute("aria-invalid")
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
      screen.getByLabelText("Share of contributor 1 in percent (optional)"),
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

  it("links a share that isn't a number to its message, once the field is left", () => {
    renderForm({
      contributors: [{ key: "a", identity: "ada.test", weight: "ten", role: "", picked: true }],
    })
    const share = screen.getByLabelText("Share of contributor 1 in percent (optional)")
    const text = "Share must be a number (decimals are fine, e.g. 12.5)."
    expect(screen.queryByText(text)).toBeNull()
    fireEvent.blur(share)
    const message = screen.getByText(text)
    expect(share.getAttribute("aria-describedby")).toBe(message.id)
    expect(share).toHaveAttribute("aria-invalid", "true")
  })

  it("shows a share's error after a save attempt without a blur", () => {
    renderForm({
      showAllErrors: true,
      contributors: [{ key: "a", identity: "ada.test", weight: "ten", role: "", picked: true }],
    })
    expect(
      screen.getByText("Share must be a number (decimals are fine, e.g. 12.5)."),
    ).toBeInTheDocument()
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
      shortDescription: "   ",
      startDate: "2024-03-01",
      endDate: "2024-01-01",
      contributors: [],
    })
    expect(result.focus).toBe("shortDescription")
    expect(result.unmet).toEqual([
      "add a short description",
      "the end date must be on or after the start date",
    ])
  })

  it("requires a summary (any length up to 300), on create and on edit", () => {
    const base = { title: "Long enough", startDate: "", endDate: "", contributors: [] }
    expect(activityFormProblems({ ...base, shortDescription: "Short." })).toEqual({ unmet: [], focus: null })
    expect(
      activityFormProblems({ ...base, shortDescription: "Shorter", savedShortDescription: "Short." }),
    ).toEqual({ unmet: [], focus: null })
    expect(activityFormProblems({ ...base, shortDescription: "" }).unmet).toEqual(["add a short description"])
    expect(activityFormProblems({ ...base, shortDescription: "x".repeat(301) }).focus).toBe("shortDescription")
  })
})
