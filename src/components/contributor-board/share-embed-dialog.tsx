"use client"

import { Copy, Check } from "lucide-react"
import AppDialog, { AppDialogHeader, AppDialogBody } from "@/components/ui/app-dialog"
import Button from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { recordUrl } from "@/lib/urls"

interface ShareEmbedDialogProps {
  did: string
  rkey: string
  onClose: () => void
}

/** Share + embed the contributor board: a public link and an <iframe> snippet. */
export function ShareEmbedDialog({ did, rkey, onClose }: ShareEmbedDialogProps) {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const shareUrl = `${origin}${recordUrl(did, "activity", rkey)}?tab=contributor-board`
  const embedUrl = `${origin}/embed/board/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`
  const embedCode = `<iframe src="${embedUrl}" width="100%" height="420" style="border:0" title="Contributor board"></iframe>`

  // One shared-hook instance per copy target so each button shows its
  // own check mark; the hook auto-resets after 1500ms.
  const { copied: linkCopied, copy: copyLink } = useCopyToClipboard()
  const { copied: embedCopied, copy: copyEmbed } = useCopyToClipboard()

  return (
    <AppDialog ariaLabel="Share contributor board" onClose={onClose} maxWidth={520}>
      <AppDialogHeader title="Share board" onClose={onClose} />
      <AppDialogBody className="space-y-4">
        <div>
          <label className="mb-1 block text-body-sm font-medium text-[var(--fg-primary)]">
            Link
          </label>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="min-w-0 flex-1 rounded-[var(--radius)] border border-[var(--border-default)] bg-[var(--bg-canvas)] px-2 py-1.5 text-body-sm text-[var(--fg-primary)]"
            />
            <Button
              size="icon"
              variant="secondary"
              aria-label="Copy link"
              onClick={() => void copyLink(shareUrl)}
            >
              {linkCopied ? <Check size={16} /> : <Copy size={16} />}
            </Button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-body-sm font-medium text-[var(--fg-primary)]">
            Embed
          </label>
          <div className="flex gap-2">
            <textarea
              readOnly
              value={embedCode}
              rows={3}
              className="min-w-0 flex-1 resize-none rounded-[var(--radius)] border border-[var(--border-default)] bg-[var(--bg-canvas)] px-2 py-1.5 font-mono text-caption text-[var(--fg-primary)]"
            />
            <Button
              size="icon"
              variant="secondary"
              aria-label="Copy embed code"
              onClick={() => void copyEmbed(embedCode)}
            >
              {embedCopied ? <Check size={16} /> : <Copy size={16} />}
            </Button>
          </div>
        </div>
      </AppDialogBody>
    </AppDialog>
  )
}

export default ShareEmbedDialog
