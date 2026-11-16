import { Fragment } from "react"
import { linkify, shortLinkText } from "@/lib/utils/linkify"

/**
 * Plain text people wrote, with its web addresses as links (comments).
 * Only http(s) addresses become links; each opens in a new tab and is
 * marked as user content (`nofollow ugc`). A long address shows short
 * (no scheme, cut at 48 characters), its full form in the tooltip. Line
 * breaks are the parent's to keep (`white-space: pre-wrap`).
 */
export default function LinkedText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((part, i) =>
        part.kind === "link" ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            title={part.href}
          >
            {shortLinkText(part.text)}
          </a>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}
