import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

/**
 * judgment-004-gate: in a GROUP context (groupDid set) the custom-domain
 * affordance must be gated OFF — the domain button(s) must not render and
 * CustomDomainModal must not mount. The CustomDomainModal writes the handle
 * via the personal XRPC `updateHandle` endpoint, which is wrong for a group
 * repo, so surfacing it in group context is a latent personal-repo
 * handle-write bug. Personal context (no groupDid) behaviour is unchanged.
 */

import UsernameCard from "../username-card"

// A multi-dot handle that `isOurHandle` treats as a Certified subdomain,
// so the "Use my own domain" affordance would normally render.
const CERTIFIED_HANDLE = "alice.certified.one"
const DID = "did:plc:alice"

afterEach(() => {
  cleanup()
})

describe("UsernameCard custom-domain affordance gating", () => {
  it("renders the custom-domain affordance in personal context (no groupDid)", () => {
    render(<UsernameCard handle={CERTIFIED_HANDLE} did={DID} />)
    expect(
      screen.getByRole("button", { name: /use my own domain/i })
    ).toBeTruthy()
  })

  it("does NOT render the custom-domain affordance in group context (groupDid set)", () => {
    render(
      <UsernameCard handle={CERTIFIED_HANDLE} did={DID} groupDid="did:plc:org" />
    )
    expect(
      screen.queryByRole("button", { name: /use my own domain/i })
    ).toBeNull()
    // The custom-domain modal must not be mounted at all in group context.
    expect(
      screen.queryByRole("dialog", { name: /use your own domain/i })
    ).toBeNull()
  })
})
