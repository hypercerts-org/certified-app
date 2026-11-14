"use client"

import { useId, useState } from "react"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import { maskKey } from "@/lib/look/custom-looks"
import { toLookError, verifyClaudeKey } from "@/lib/look/generate-look"
import { normalizeSiteUrl } from "@/lib/look/site-design"
import { RunStatus, useLookRun } from "./look-run"

const KEYS_PAGE = "https://platform.claude.com/settings/keys"

function KeyForm({ onSave }: { onSave: (key: string) => void }) {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const key = value.trim()
    if (!key) {
      setError("Paste your Claude API key.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await verifyClaudeKey(key)
      setValue("")
      onSave(key)
    } catch (err) {
      setError(toLookError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="max-w-[28rem]">
        <Input
          type="password"
          label="Claude API key"
          placeholder="sk-ant-…"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error ?? undefined}
          helperText="Kept in this browser and sent only to Anthropic, never to Certified."
        />
      </div>
      <p className="m-0 max-w-measure text-body-sm text-[var(--fg-muted)] text-pretty">
        Make a key in the{" "}
        <a href={KEYS_PAGE} target="_blank" rel="noreferrer" className="text-[var(--fg-primary)] underline underline-offset-2">
          Claude Console
        </a>
        . Saving checks it with Anthropic first, which costs nothing.
      </p>
      <div>
        <Button type="submit" size="sm" loading={busy}>
          Save key
        </Button>
      </div>
    </form>
  )
}

function SiteForm({ statusId }: { statusId: string }) {
  const { run } = useLookRun()
  const [site, setSite] = useState("")
  const { phase, busy } = run
  // A new version being made from the gallery holds the form, without its
  // progress: that shows by the gallery.
  const makingNew = busy && run.refreshingId === null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const url = normalizeSiteUrl(site)
    if (!url) {
      run.fieldError("Enter a website address, like example.com.")
      return
    }
    if (await run.start({ kind: "new", url, slot: "maker" })) setSite("")
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate aria-describedby={statusId}>
      <div className="max-w-[28rem]">
        <Input
          type="text"
          inputMode="url"
          label="Website"
          placeholder="example.com"
          autoComplete="url"
          spellCheck={false}
          value={site}
          disabled={busy}
          onChange={(e) => {
            setSite(e.target.value)
            run.clearFieldError()
          }}
          error={phase.kind === "error" && phase.field ? phase.message : undefined}
        />
      </div>
      <div className="flex gap-2">
        {makingNew ? (
          <>
            <Button type="button" size="sm" loading>
              Making style
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={run.stop}>
              Stop
            </Button>
          </>
        ) : (
          <Button type="submit" size="sm" disabled={busy}>
            Make style
          </Button>
        )}
      </div>
    </form>
  )
}

/**
 * Settings → Appearance → Make a style from a website (experimental): the
 * person's Claude API key and a website. The styles made so far are tiles
 * in the gallery above, with their own New version and Remove
 * (look-picker.tsx); both share one run (look-run.tsx). The website is
 * read by Certified's server (/api/looks/site-design, and screenshots
 * from /api/looks/site-capture); Claude is called from this browser with
 * the person's key (generate-look.ts).
 */
export default function CustomLookMaker() {
  const { apiKey, setApiKey, run } = useLookRun()
  const statusId = useId()
  return apiKey ? (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-body-sm font-medium text-[var(--fg-primary)]">Claude API key</span>
          <span className="truncate text-caption text-[var(--fg-muted)]">{maskKey(apiKey)} · in this browser only</span>
        </span>
        <Button size="sm" variant="secondary" onClick={() => setApiKey(null)} disabled={run.busy}>
          Remove key
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <SiteForm statusId={statusId} />
        <RunStatus statusId={statusId} slot="maker" />
      </div>
    </div>
  ) : (
    <KeyForm onSave={setApiKey} />
  )
}
