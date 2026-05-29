import { describe, it, expect, vi, afterEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

import ProfileEditForm from "../profile-edit-form"

// quality-056-profile-edit-3: the raw <input>/<textarea> fields surface
// validation errors in a sibling <p class="pe__field-error">, but they
// did not point screen readers at that text. Each field that can show an
// error must set aria-describedby to the error <p>'s matching id when the
// error is present, so assistive tech announces why the field is invalid.

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

    const input = container.querySelector(
      "input.pe__input",
    ) as HTMLInputElement
    expect(input).toBeTruthy()

    // Trigger the >64 char validation error.
    fireEvent.change(input, { target: { value: "a".repeat(65) } })

    const error = container.querySelector(
      ".pe__field-error",
    ) as HTMLParagraphElement | null
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

    const field = website.closest(".pe__field")
    const error = field?.querySelector(
      ".pe__field-error",
    ) as HTMLParagraphElement | null
    expect(error).toBeTruthy()
    expect(error!.id).toBeTruthy()
    expect(website.getAttribute("aria-describedby")).toBe(error!.id)
  })

  it("does not set a dangling aria-describedby when the field is valid", () => {
    const { container } = render(
      <ProfileEditForm {...baseProps} isOrg={false} />,
    )

    const input = container.querySelector(
      "input.pe__input",
    ) as HTMLInputElement
    // No error rendered for an empty/short display name.
    expect(container.querySelector(".pe__field-error")).toBeNull()
    expect(input.getAttribute("aria-describedby")).toBeNull()
  })
})
