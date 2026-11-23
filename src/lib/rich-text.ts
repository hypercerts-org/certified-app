// Long texts as records hold them: a plain string, an
// org.hypercerts.defs#descriptionString, or a Leaflet document
// (pub.leaflet.pages.linearDocument), read into a small, safe model the page
// renders (components/rich-text). Only what the network's documents use is
// read: paragraphs, headings, bulleted lists, quotes and dividers, with bold,
// italic, underline and links; an embed (an iframe block) becomes a link to
// what it shows, so no third-party frame loads on our pages. Anything else is
// left out. Links are http(s) only.

import { safeUrl } from "@/lib/safe-url";

/** A run of text with one set of styles. */
export type Span = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** http(s) only. */
  href?: string;
};

export type ListItem = { spans: Span[]; children: ListItem[] };

export type Block =
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "heading"; level: 1 | 2 | 3; spans: Span[] }
  | { kind: "list"; items: ListItem[] }
  | { kind: "quote"; spans: Span[] }
  | { kind: "rule" }
  | { kind: "embed"; href: string };

export type RichText = Block[];

const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
const asText = (value: unknown): string | null => (typeof value === "string" ? value : null);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A text block's runs: Leaflet's facets mark byte ranges (UTF-8) of the
 * plaintext with features; each run between two boundaries gets the
 * features of every facet covering it.
 */
export function spansOf(plaintext: string, facets: unknown): Span[] {
  const bytes = encoder.encode(plaintext);
  const marks = (Array.isArray(facets) ? facets : []).flatMap((entry) => {
    const facet = asObject(entry);
    const index = asObject(facet?.index);
    const start = Number(index?.byteStart);
    const end = Number(index?.byteEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return [];
    const features = (Array.isArray(facet?.features) ? facet.features : []).map(asObject);
    return [{ start: Math.min(start, bytes.length), end: Math.min(end, bytes.length), features }];
  });
  const cuts = [
    ...new Set([0, bytes.length, ...marks.flatMap((mark) => [mark.start, mark.end])]),
  ].sort((a, b) => a - b);

  const spans: Span[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const [from, to] = [cuts[i], cuts[i + 1]];
    if (from === to) continue;
    const span: Span = { text: decoder.decode(bytes.slice(from, to)) };
    for (const mark of marks) {
      if (mark.start > from || mark.end < to) continue;
      for (const feature of mark.features) {
        const type = asText(feature?.$type);
        if (type === "pub.leaflet.richtext.facet#bold") span.bold = true;
        else if (type === "pub.leaflet.richtext.facet#italic") span.italic = true;
        else if (type === "pub.leaflet.richtext.facet#underline") span.underline = true;
        else if (type === "pub.leaflet.richtext.facet#link") {
          const href = safeUrl(feature?.uri);
          if (href) span.href = href;
        }
      }
    }
    const last = spans.at(-1);
    // Neighbours with the same styles read as one run.
    if (
      last &&
      last.bold === span.bold &&
      last.italic === span.italic &&
      last.underline === span.underline &&
      last.href === span.href
    ) {
      last.text += span.text;
    } else {
      spans.push(span);
    }
  }
  return spans;
}

function textSpans(block: Record<string, unknown> | null): Span[] {
  return spansOf(asText(block?.plaintext) ?? "", block?.facets);
}

function listItems(children: unknown): ListItem[] {
  return (Array.isArray(children) ? children : []).flatMap((entry) => {
    const item = asObject(entry);
    const spans = textSpans(asObject(item?.content));
    const nested = listItems(item?.children);
    return spans.length > 0 || nested.length > 0 ? [{ spans, children: nested }] : [];
  });
}

function blockOf(value: unknown): Block | null {
  const block = asObject(value);
  switch (asText(block?.$type)) {
    case "pub.leaflet.blocks.text": {
      const spans = textSpans(block);
      return spans.some((span) => span.text.trim()) ? { kind: "paragraph", spans } : null;
    }
    case "pub.leaflet.blocks.header": {
      const spans = textSpans(block);
      const level = Number(block?.level);
      return spans.length > 0
        ? { kind: "heading", level: level === 1 ? 1 : level === 2 ? 2 : 3, spans }
        : null;
    }
    case "pub.leaflet.blocks.blockquote": {
      const spans = textSpans(block);
      return spans.length > 0 ? { kind: "quote", spans } : null;
    }
    case "pub.leaflet.blocks.unorderedList": {
      const items = listItems(block?.children);
      return items.length > 0 ? { kind: "list", items } : null;
    }
    case "pub.leaflet.blocks.horizontalRule":
      return { kind: "rule" };
    case "pub.leaflet.blocks.iframe": {
      const href = safeUrl(block?.url);
      return href ? { kind: "embed", href } : null;
    }
    default:
      return null;
  }
}

/** Plain text as paragraphs: a blank line between them. */
function paragraphsOf(text: string): RichText {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ kind: "paragraph", spans: [{ text: part }] }));
}

/** A record's long text as the model, or null when it has none. */
export function richTextOf(value: unknown): RichText | null {
  const direct = asText(value);
  const record = asObject(value);
  let blocks: RichText = [];
  if (direct) blocks = paragraphsOf(direct);
  else if (record?.$type === "org.hypercerts.defs#descriptionString") {
    blocks = paragraphsOf(asText(record.value) ?? "");
  } else if (Array.isArray(record?.blocks)) {
    blocks = record.blocks.flatMap((entry) => {
      const block = blockOf(asObject(entry)?.block);
      return block ? [block] : [];
    });
  }
  // A divider at either end separates nothing.
  while (blocks[0]?.kind === "rule") blocks.shift();
  while (blocks.at(-1)?.kind === "rule") blocks.pop();
  return blocks.length > 0 ? blocks : null;
}

/** A text's words, for comparing: its runs joined, spaces collapsed, lower case. */
function wordsOf(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** The model's plain text. */
export function plainTextOf(text: RichText): string {
  const items = (list: ListItem[]): string[] =>
    list.flatMap((item) => [item.spans.map((span) => span.text).join(""), ...items(item.children)]);
  return text
    .flatMap((block) =>
      "spans" in block
        ? [block.spans.map((span) => span.text).join("")]
        : block.kind === "list"
          ? items(block.items)
          : [],
    )
    .join(" ");
}

/**
 * A record's short description as a lead above its long text, or null when
 * the long text already says it: short descriptions are often the long one's
 * opening, cut off with "…".
 */
export function leadOf(short: string | null, long: RichText | null): string | null {
  if (!short) return null;
  if (!long) return short;
  const opening = wordsOf(short)
    .replace(/(\.\.\.|…)$/, "")
    .trim();
  return wordsOf(plainTextOf(long)).startsWith(opening) ? null : short;
}
