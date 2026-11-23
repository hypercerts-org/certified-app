import { describe, expect, it } from "vitest";
import { leadOf, richTextOf, spansOf } from "./rich-text";

const facet = (byteStart: number, byteEnd: number, ...features: object[]) => ({
  index: { byteStart, byteEnd },
  features,
});
const bold = { $type: "pub.leaflet.richtext.facet#bold" };
const link = (uri: string) => ({ $type: "pub.leaflet.richtext.facet#link", uri });

describe("spansOf", () => {
  it("splits text at facet boundaries", () => {
    expect(spansOf("Hello world", [facet(6, 11, bold)])).toEqual([
      { text: "Hello " },
      { text: "world", bold: true },
    ]);
  });

  it("counts offsets in UTF-8 bytes", () => {
    // "é" is two bytes: "Café " is 6 bytes long.
    expect(spansOf("Café ok", [facet(6, 8, bold)])).toEqual([
      { text: "Café " },
      { text: "ok", bold: true },
    ]);
  });

  it("keeps only http(s) links", () => {
    expect(
      spansOf("a b", [
        facet(0, 1, link("javascript:alert(1)")),
        facet(2, 3, link("https://x.org")),
      ]),
    ).toEqual([{ text: "a " }, { text: "b", href: "https://x.org" }]);
  });

  it("ignores facets outside the text", () => {
    expect(spansOf("hi", [facet(5, 9, bold)])).toEqual([{ text: "hi" }]);
  });
});

describe("richTextOf", () => {
  it("reads a Leaflet document's blocks", () => {
    const doc = {
      $type: "pub.leaflet.pages.linearDocument",
      blocks: [
        { block: { $type: "pub.leaflet.blocks.horizontalRule" } },
        { block: { $type: "pub.leaflet.blocks.header", level: 2, plaintext: "Title" } },
        { block: { $type: "pub.leaflet.blocks.text", plaintext: "Body" } },
        { block: { $type: "pub.leaflet.blocks.text", plaintext: "  " } },
        {
          block: {
            $type: "pub.leaflet.blocks.unorderedList",
            children: [{ content: { $type: "pub.leaflet.blocks.text", plaintext: "One" } }],
          },
        },
        { block: { $type: "pub.leaflet.blocks.iframe", url: "https://video.example/embed/1" } },
        { block: { $type: "pub.leaflet.blocks.image" } },
      ],
    };
    expect(richTextOf(doc)).toEqual([
      { kind: "heading", level: 2, spans: [{ text: "Title" }] },
      { kind: "paragraph", spans: [{ text: "Body" }] },
      { kind: "list", items: [{ spans: [{ text: "One" }], children: [] }] },
      { kind: "embed", href: "https://video.example/embed/1" },
    ]);
  });

  it("reads plain text as paragraphs", () => {
    expect(
      richTextOf({ $type: "org.hypercerts.defs#descriptionString", value: "One\nline\n\nTwo" }),
    ).toEqual([
      { kind: "paragraph", spans: [{ text: "One\nline" }] },
      { kind: "paragraph", spans: [{ text: "Two" }] },
    ]);
  });

  it("is null without text", () => {
    expect(richTextOf(undefined)).toBeNull();
    expect(richTextOf({ blocks: [] })).toBeNull();
  });
});

describe("leadOf", () => {
  const long = richTextOf("Restores a patch of land. More follows.");
  it("leaves out a short description the long text opens with", () => {
    expect(leadOf("Restores a patch…", long)).toBeNull();
    expect(leadOf("restores a   patch of land.", long)).toBeNull();
  });
  it("keeps one that says something else", () => {
    expect(leadOf("A garden project.", long)).toBe("A garden project.");
    expect(leadOf("A garden project.", null)).toBe("A garden project.");
  });
});
