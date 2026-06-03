import { describe, it, expect, vi, afterEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

import ProfileEditForm from "../profile-edit-form"

// quality-056-profile-edit-3: the validated text fields surface their error
// to screen readers via aria-describedby pointing at the error text's id.
// The display-name, pronouns, and website fields now render through the
// <Input> primitive, which owns that wiring: when `error` is set it renders
// a <p id="<input-id>-error" role="alert"> and points the input's
// aria-describedby at it. The bio field is still a raw <textarea> that wires
// aria-describedby by hand. Either way, each field that can show an error
// must link to its error text so assistive tech announces why it's invalid.

// next/navigation is required by the form (useRouter for Cancel/back nav).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

afterEach(() => {
  cleanup()
})

const baseProps = {
  initialProfile: null,
  initialOrgUrls: [],
  handle: "alice.test",
  onSave: vi.fn().mockResolvedValue(undefined),
  isSaving: false,
  saveError: null,
  onAvatarUpload: vi.fn().mockResolvedValue({} as never),
  onBannerUpload: vi.fn().mockResolvedValue({} as never),
  currentAvatarUrl: null,
  currentBannerUrl: null,
  fallbackInitials: "AL",
}

describe("ProfileEditForm error aria-describedby", () => {
  it("links the display-name input to its error text when invalid", () => {
    const { container } = render(
      <ProfileEditForm {...baseProps} isOrg={false} />,
    )

    // First text input in the (non-org) form is the display name.
    const input = container.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement
    expect(input).toBeTruthy()

    // Trigger the >64 char validation error.
    fireEvent.change(input, { target: { value: "a".repeat(65) } })

    // The <Input> primitive renders the error as <p role="alert"> and points
    // the field's aria-describedby at its id.
    const error = input
      .closest(".pe__field")
      ?.querySelector('p[role="alert"]') as HTMLParagraphElement | null
    expect(error).toBeTruthy()
    expect(error!.id).toBeTruthy()

    const describedBy = input.getAttribute("aria-describedby")
    expect(describedBy).toBe(error!.id)
  })

  it("links the bio textarea to its error text when invalid", () => {
    const { container } = render(
      <ProfileEditForm {...baseProps} isOrg={false} />,
    )

    const textarea = container.querySelector(
      "textarea.pe__textarea",
    ) as HTMLTextAreaElement
    expect(textarea).toBeTruthy()

    fireEvent.change(textarea, { target: { value: "x".repeat(257) } })

    const error = textarea
      .closest(".pe__field")
      ?.querySelector(".pe__field-error") as HTMLParagraphElement | null
    expect(error).toBeTruthy()
    expect(error!.id).toBeTruthy()
    expect(textarea.getAttribute("aria-describedby")).toBe(error!.id)
  })

  it("links the website input to its error text when invalid", () => {
    const { container } = render(
      <ProfileEditForm {...baseProps} isOrg={false} />,
    )

    const website = container.querySelector(
      'input[type="url"]',
    ) as HTMLInputElement
    expect(website).toBeTruthy()

    fireEvent.change(website, { target: { value: "not a url" } })

    // Website renders through <Input>; its error is a <p role="alert">.
    const field = website.closest(".pe__field")
    const error = field?.querySelector(
      'p[role="alert"]',
    ) as HTMLParagraphElement | null
    expect(error).toBeTruthy()
    expect(error!.id).toBeTruthy()
    expect(website.getAttribute("aria-describedby")).toBe(error!.id)
  })

  it("does not set a dangling aria-describedby when the field is valid", () => {
    const { container } = render(
      <ProfileEditForm {...baseProps} isOrg={false} />,
    )

    // The display name (first text input) has no error and no helper text,
    // so a valid value must leave aria-describedby unset.
    const input = container.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement
    // No error rendered for an empty/short display name.
    expect(
      input.closest(".pe__field")?.querySelector('p[role="alert"]'),
    ).toBeFalsy()
    expect(input.getAttribute("aria-describedby")).toBeNull()
  })
})
