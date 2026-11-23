// A long text (lib/rich-text): paragraphs, headings, lists, quotes and
// dividers, in the page's type. Its headings sit below the page's own (the
// title is h1, sections h2), so a text's top level is h3. An embed is a link
// to what it shows, named by its domain.

import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import type { Block, ListItem, RichText as RichTextModel, Span } from "@/lib/rich-text";

function Spans({ spans }: { spans: Span[] }) {
  return spans.map((span, i) => {
    let node: ReactNode = span.text;
    if (span.bold) node = <strong>{node}</strong>;
    if (span.italic) node = <em>{node}</em>;
    if (span.underline) node = <u>{node}</u>;
    if (span.href) {
      node = (
        <a href={span.href} target="_blank" rel="noopener noreferrer">
          {node}
        </a>
      );
    }
    // Runs have no identity of their own; their order never changes.
    // biome-ignore lint/suspicious/noArrayIndexKey: a static list of runs
    return <span key={i}>{node}</span>;
  });
}

function Items({ items }: { items: ListItem[] }) {
  return (
    <ul>
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a static list
        <li key={i}>
          <Spans spans={item.spans} />
          {item.children.length > 0 && <Items items={item.children} />}
        </li>
      ))}
    </ul>
  );
}

const domainOf = (href: string) => new URL(href).hostname.replace(/^www\./, "");

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "paragraph":
      return (
        <p>
          <Spans spans={block.spans} />
        </p>
      );
    case "heading": {
      const Tag = (["h3", "h4", "h5"] as const)[block.level - 1];
      return (
        <Tag>
          <Spans spans={block.spans} />
        </Tag>
      );
    }
    case "list":
      return <Items items={block.items} />;
    case "quote":
      return (
        <blockquote>
          <Spans spans={block.spans} />
        </blockquote>
      );
    case "rule":
      return <hr />;
    case "embed":
      return (
        <p className="rich-text-embed">
          <a href={block.href} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden />
            Embedded content on {domainOf(block.href)}
          </a>
        </p>
      );
  }
}

export function RichText({ text, className }: { text: RichTextModel; className?: string }) {
  return (
    <div className={["rich-text", className].filter(Boolean).join(" ")} dir="auto">
      {text.map((block, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a static list of blocks
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}
