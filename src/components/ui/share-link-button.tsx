"use client"

import { Check, Link as LinkIcon } from "lucide-react"
import Button from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

/** A touch device whose browser has a share sheet (phones, tablets). On a
 *  desktop the link is copied, even where the browser could share. */
function canShareNatively(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false
  }
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches
}

/**
 * Share for any visitor. On a phone or tablet it opens the system share
 * sheet (`navigator.share`, with the page's title and link); elsewhere,
 * or when the sheet can't open, it copies the absolute link to the page
 * (a profile or a record) and says so in place. The origin is read at
 * click time, so the link is right in every environment.
 */
export default function ShareLinkButton({
  path,
  what = "Link",
  title,
  className,
}: {
  /** App path to share, e.g. `/handle` or `/handle/project/rkey?tab=funding`. */
  path: string
  /** What the link is to, for the announcement ("Profile link copied"). */
  what?: string
  /** The title the share sheet offers with the link (the account's name,
   *  the record's title); the page's title when not given. */
  title?: string
  className?: string
}) {
  const { copied, copy } = useCopyToClipboard()

  const onClick = async () => {
    const url = `${window.location.origin}${path}`
    if (canShareNatively()) {
      try {
        await navigator.share({ title: title || document.title, url })
        return
      } catch (err) {
        // Closing the sheet is a choice, not a failure.
        if (err instanceof DOMException && err.name === "AbortError") return
        // Anything else (not allowed here, a busy sheet): copy instead.
      }
    }
    await copy(url)
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className={className}
        onClick={() => void onClick()}
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
