import { describe, expect, it } from "vitest"
import { firstParagraphText, leadText, titleAndTeaser, withoutLeadParagraph } from "../strip-lead"

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

describe("leadText", () => {
  const cut = "We work in the commons where buildings drain the rain, instead of retaining, r..."
  const full =
    "We work in the commons where buildings drain the rain, instead of retaining, reusing and sharing it."

  it("keeps a whole summary", () => {
    expect(leadText("Our lead.", "Our lead. More.")).toBe("Our lead.")
    expect(leadText(null, "Anything")).toBeNull()
  })

  it("reads a summary cut short in the data from the description", () => {
    expect(leadText(cut, `${full}\n\nMore.`)).toBe(full)
    expect(leadText(cut.replace("...", "…"), doc(text(full), text("More.")))).toBe(full)
  })

  it("drops a stub of a word at the cut when the description doesn't help", () => {
    expect(leadText(cut, "Something else entirely.")).toBe(
      "We work in the commons where buildings drain the rain, instead of retaining…",
    )
    expect(leadText("Coastal ecosystems play a fundamental ro...", null)).toBe(
      "Coastal ecosystems play a fundamental…",
    )
    expect(leadText("Trees, rivers and more...", null)).toBe("Trees, rivers and more...")
  })
})

describe("titleAndTeaser", () => {
  it("takes a title cut short in the data from the body", () => {
    expect(
      titleAndTeaser(
        "Help us turn asphalt into oases watered by harvested stormwate…",
        "Help us turn asphalt into oases watered by harvested stormwater. Next we plant.",
      ),
    ).toEqual({
      title: "Help us turn asphalt into oases watered by harvested stormwater.",
      teaser: "Next we plant.",
    })
  })

  it("skips a first sentence that repeats the title", () => {
    expect(titleAndTeaser("Our first harvest", "Our first harvest. It went well.")).toEqual({
      title: "Our first harvest",
      teaser: "It went well.",
    })
  })

  it("leaves a different body alone", () => {
    expect(titleAndTeaser("Our first harvest", "It went well.")).toEqual({
      title: "Our first harvest",
      teaser: "It went well.",
    })
  })
})
