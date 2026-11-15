"use client"

import { Check, Link as LinkIcon } from "lucide-react"
import Button from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

/**
 * Share for any visitor: copies the absolute link to a page (a profile or
 * a record) and says so in place. The origin is read at click time, so
 * the link is right in every environment.
 */
export default function ShareLinkButton({
  path,
  what = "Link",
  className,
}: {
  /** App path to share, e.g. `/handle` or `/handle/project/rkey?tab=funding`. */
  path: string
  /** What the link is to, for the announcement ("Profile link copied"). */
  what?: string
  className?: string
}) {
  const { copied, copy } = useCopyToClipboard()
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className={className}
        onClick={() => void copy(`${window.location.origin}${path}`)}
      >
        {copied ? (
          <Check size={16} strokeWidth={1.75} aria-hidden />
        ) : (
          <LinkIcon size={16} strokeWidth={1.75} aria-hidden />
        )}
        {copied ? "Link copied" : "Share"}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? `${what} copied` : ""}
      </span>
    </>
  )
}
