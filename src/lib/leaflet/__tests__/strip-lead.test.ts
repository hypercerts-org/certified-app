import { describe, expect, it } from "vitest"
import { firstParagraphText, withoutLeadParagraph } from "../strip-lead"

const doc = (...blocks: { $type: string; plaintext?: string }[]) => ({
  $type: "pub.leaflet.pages.linearDocument",
  blocks: blocks.map((block) => ({ block })),
})
const text = (plaintext: string) => ({ $type: "pub.leaflet.blocks.text", plaintext })
const header = (plaintext: string) => ({ $type: "pub.leaflet.blocks.header", plaintext })
const image = () => ({ $type: "pub.leaflet.blocks.image" })

describe("withoutLeadParagraph", () => {
  it("drops a first paragraph that repeats the lead, ignoring case and spacing", () => {
    expect(withoutLeadParagraph("Our  lead.\n\nThe rest.", "our lead.")).toBe("The rest.")
    expect(withoutLeadParagraph(doc(text(""), text("Our lead."), text("More")), "Our lead.")).toEqual(
      doc(text("More")),
    )
  })

  it("drops a first heading that repeats the lead", () => {
    expect(withoutLeadParagraph(doc(header("Our lead"), text("More")), "Our lead")).toEqual(
      doc(text("More")),
    )
  })

  it("returns null when nothing is left", () => {
    expect(withoutLeadParagraph("Our lead.", "Our lead.")).toBeNull()
    expect(withoutLeadParagraph(doc(text("Our lead.")), "Our lead.")).toBeNull()
  })

  it("keeps everything otherwise", () => {
    const d = doc(image(), text("Our lead."))
    expect(withoutLeadParagraph(d, "Our lead.")).toBe(d)
    expect(withoutLeadParagraph("Something else.", "Our lead.")).toBe("Something else.")
    expect(withoutLeadParagraph("Our lead.", null)).toBe("Our lead.")
    const other = { $type: "org.hypercerts.defs#descriptionString", value: "Our lead." }
    expect(withoutLeadParagraph(other, "Our lead.")).toBe(other)
  })
})

describe("firstParagraphText", () => {
  it("reads the first paragraph, skipping what isn't text", () => {
    expect(firstParagraphText("\n\nFirst.\n\nSecond.")).toBe("First.")
    expect(firstParagraphText(doc(image(), text(" "), text("First."), text("Second.")))).toBe(
      "First.",
    )
    expect(firstParagraphText(doc(image()))).toBeNull()
    expect(firstParagraphText(undefined)).toBeNull()
  })
})
