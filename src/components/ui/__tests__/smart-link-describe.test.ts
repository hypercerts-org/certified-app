import { describe, it, expect } from "vitest"
import { describeLink } from "../smart-link"

/** The profile header draws a website as text and a social account as a
 *  labelled icon button; describeLink tells them apart and names the
 *  service. */
describe("describeLink", () => {
  it("names the service of a social account", () => {
    expect(describeLink("https://www.facebook.com/goecowaikato")).toMatchObject({
      service: "Facebook",
      display: "goecowaikato",
    })
    expect(describeLink("https://twitter.com/GoEcoWaikato")).toMatchObject({
      service: "X",
      display: "@GoEcoWaikato",
    })
    expect(describeLink("https://linkedin.com/company/maearth")).toMatchObject({
      service: "LinkedIn",
    })
  })

  it("reads a website as its bare host, with no service", () => {
    expect(describeLink("https://www.goeco.org.nz/")).toMatchObject({
      service: null,
      display: "goeco.org.nz",
      href: "https://www.goeco.org.nz/",
    })
  })

  it("adds the scheme to a bare domain and refuses other schemes", () => {
    expect(describeLink("maearth.com")?.href).toBe("https://maearth.com")
    expect(describeLink("javascript:alert(1)")).toBeNull()
  })
})
