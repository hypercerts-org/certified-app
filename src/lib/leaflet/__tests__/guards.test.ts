import { describe, it, expect } from "vitest"
import {
  descriptionStringText,
  isEmptyLongDescription,
  longDescriptionPlainText,
  longDescriptionToLinearDocument,
  splitParagraphs,
} from "../guards"

/**
 * Long descriptions arrive in three shapes: the lexicon's
 * `org.hypercerts.defs#descriptionString` (what other clients write — every
 * sample organization's long description has this shape), a leaflet
 * document (what this app's editor writes), and a legacy bare string. All
 * three must read as content, with their paragraphs.
 */
const DESCRIPTION = {
  $type: "org.hypercerts.defs#descriptionString",
  value:
    "Go Eco Waikato is an environmental charity.\n\nFor over twenty years, we have worked alongside hapū.\n\nWe believe thriving communities depend on thriving ecosystems.\nOur team brings experience. \n\n",
}

describe("descriptionStringText", () => {
  it("reads the descriptionString object", () => {
    expect(descriptionStringText(DESCRIPTION)).toBe(DESCRIPTION.value)
  })

  it("accepts the bare { value } shape", () => {
    expect(descriptionStringText({ value: "Text" })).toBe("Text")
  })

  it("ignores other shapes", () => {
    expect(descriptionStringText("Text")).toBeNull()
    expect(descriptionStringText({ $type: "pub.leaflet.pages.linearDocument", blocks: [] })).toBeNull()
    expect(descriptionStringText({ $type: "something.else", value: "Text" })).toBeNull()
    expect(descriptionStringText(null)).toBeNull()
  })
})

describe("splitParagraphs", () => {
  it("splits on blank lines and keeps single line breaks inside a paragraph", () => {
    expect(splitParagraphs(DESCRIPTION.value)).toEqual([
      "Go Eco Waikato is an environmental charity.",
      "For over twenty years, we have worked alongside hapū.",
      "We believe thriving communities depend on thriving ecosystems.\nOur team brings experience.",
    ])
  })

  it("treats Windows line endings and whitespace-only lines as breaks", () => {
    expect(splitParagraphs("One\r\n \r\nTwo")).toEqual(["One", "Two"])
  })

  it("drops empty text", () => {
    expect(splitParagraphs("  \n\n  ")).toEqual([])
  })
})

describe("isEmptyLongDescription", () => {
  it("counts a descriptionString with text as content", () => {
    expect(isEmptyLongDescription(DESCRIPTION)).toBe(false)
  })

  it("counts a blank descriptionString as empty", () => {
    expect(isEmptyLongDescription({ $type: DESCRIPTION.$type, value: " \n " })).toBe(true)
  })
})

describe("longDescriptionToLinearDocument", () => {
  it("turns each paragraph of a descriptionString into a text block", () => {
    const doc = longDescriptionToLinearDocument(DESCRIPTION)
    expect(doc?.blocks.map((b) => (b.block as { plaintext: string }).plaintext)).toEqual(
      splitParagraphs(DESCRIPTION.value),
    )
    expect(doc?.blocks.every((b) => b.block.$type === "pub.leaflet.blocks.text")).toBe(true)
  })

  it("does the same for a plain string", () => {
    expect(longDescriptionToLinearDocument("One\n\nTwo")?.blocks).toHaveLength(2)
  })

  it("passes a leaflet document through", () => {
    const doc = {
      $type: "pub.leaflet.pages.linearDocument",
      blocks: [{ block: { $type: "pub.leaflet.blocks.text", plaintext: "Hi" } }],
    }
    expect(longDescriptionToLinearDocument(doc)?.blocks).toEqual(doc.blocks)
  })

  it("is null for nothing", () => {
    expect(longDescriptionToLinearDocument(null)).toBeNull()
    expect(longDescriptionToLinearDocument({ value: "   " })).toBeNull()
  })
})

describe("longDescriptionPlainText", () => {
  it("joins a document's text blocks and list items as paragraphs", () => {
    const doc = {
      $type: "pub.leaflet.pages.linearDocument",
      blocks: [
        { block: { $type: "pub.leaflet.blocks.header", plaintext: "About us" } },
        { block: { $type: "pub.leaflet.blocks.text", plaintext: "We plant trees." } },
        {
          block: {
            $type: "pub.leaflet.blocks.unorderedList",
            children: [{ content: { plaintext: "Mangroves" } }],
          },
        },
      ],
    }
    expect(longDescriptionPlainText(doc)).toBe("About us\n\nWe plant trees.\n\nMangroves")
  })

  it("reads a descriptionString", () => {
    expect(longDescriptionPlainText(DESCRIPTION)?.startsWith("Go Eco Waikato")).toBe(true)
  })

  it("is null when there is no text", () => {
    expect(longDescriptionPlainText(undefined)).toBeNull()
  })
})
