"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Trash2 } from "lucide-react"
import Banner from "@/components/ui/banner"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import type { SiteDesignResponse } from "@/app/api/looks/site-design/route"
import {
  addCustomLook,
  maskKey,
  removeCustomLook,
  useClaudeKey,
  useCustomLooks,
} from "@/lib/look/custom-looks"
import { LookGenerationError, LOOK_MODEL_NAME, generateLookSpec, toLookError, verifyClaudeKey } from "@/lib/look/generate-look"
import { normalizeSiteUrl } from "@/lib/look/site-design"

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

type Phase =
  | { kind: "idle" }
  | { kind: "reading"; host: string }
  | { kind: "designing"; host: string }
  | { kind: "done"; name: string; host: string }
  | { kind: "error"; message: string; field: boolean }

function SiteForm({ apiKey }: { apiKey: string }) {
  const [site, setSite] = useState("")
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const abortRef = useRef<AbortController | null>(null)
  const statusId = useId()

  // Leaving the page stops a style being made.
  useEffect(() => () => abortRef.current?.abort(), [])

  const busy = phase.kind === "reading" || phase.kind === "designing"

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const url = normalizeSiteUrl(site)
    if (!url) {
      setPhase({ kind: "error", message: "Enter a website address, like example.com.", field: true })
      return
    }
    const host = url.hostname.replace(/^www\./, "")
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPhase({ kind: "reading", host })
    try {
      const res = await fetch(`/api/looks/site-design?url=${encodeURIComponent(url.toString())}`, {
        signal: ctrl.signal,
      })
      const body = (await res.json().catch(() => ({}))) as SiteDesignResponse
      if (!res.ok || !body.design) {
        throw new LookGenerationError("site", body.error ?? "Couldn't read that website.")
      }
      setPhase({ kind: "designing", host })
      const spec = await generateLookSpec({ apiKey, design: body.design, signal: ctrl.signal })
      const look = addCustomLook(spec, host)
      setPhase({ kind: "done", name: look.spec.name, host })
      setSite("")
    } catch (err) {
      const error = toLookError(err)
      setPhase(error.code === "aborted" ? { kind: "idle" } : { kind: "error", message: error.message, field: false })
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null
    }
  }

  return (
    <form onSubmit={run} className="flex flex-col gap-3" noValidate aria-describedby={statusId}>
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
            if (phase.kind === "error" && phase.field) setPhase({ kind: "idle" })
          }}
          error={phase.kind === "error" && phase.field ? phase.message : undefined}
        />
      </div>
      <div className="flex gap-2">
        {busy ? (
          <>
            <Button type="button" size="sm" loading>
              Making style
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => abortRef.current?.abort()}>
              Stop
            </Button>
          </>
        ) : (
          <Button type="submit" size="sm">
            Make style
          </Button>
        )}
      </div>

      <div id={statusId} role="status" aria-live="polite" className="text-body-sm text-[var(--fg-muted)]">
        {phase.kind === "reading" ? <p className="m-0">Reading {phase.host}…</p> : null}
        {phase.kind === "designing" ? (
          <p className="m-0">
            {LOOK_MODEL_NAME} is making a style from {phase.host}. This can take a minute.
          </p>
        ) : null}
        {phase.kind === "done" ? (
          <p className="m-0 text-[var(--fg-primary)]">
            Made “{phase.name}” from {phase.host} and switched to it. It’s with the other styles above.
          </p>
        ) : null}
      </div>
      {phase.kind === "error" && !phase.field ? <Banner variant="error">{phase.message}</Banner> : null}
    </form>
  )
}

function MadeLooks() {
  const looks = useCustomLooks()
  const headingId = useId()
  if (!looks.length) return null
  return (
    <div className="flex flex-col gap-2">
      <h4 id={headingId} className="m-0 text-body-sm font-medium text-[var(--fg-primary)]">
        Made in this browser
      </h4>
      <ul aria-labelledby={headingId} className="m-0 flex list-none flex-col divide-y divide-[var(--border-subtle)] p-0">
        {looks.map((look) => (
          <li key={look.id} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body-sm text-[var(--fg-primary)]">{look.spec.name}</span>
              <span className="truncate text-caption text-[var(--fg-muted)]">From {look.source}</span>
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${look.spec.name}`}
              onClick={() => removeCustomLook(look.id)}
            >
              <Trash2 size={16} aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Settings → Appearance → Make a style from a website (experimental): the
 * person's Claude API key, a website, and the styles made so far. The
 * website is read by Certified's server (/api/looks/site-design); Claude is
 * called from this browser with the person's key (generate-look.ts).
 */
export default function CustomLookMaker() {
  const [apiKey, setApiKey] = useClaudeKey()
  return (
    <div className="flex flex-col gap-6">
      {apiKey ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-body-sm font-medium text-[var(--fg-primary)]">Claude API key</span>
              <span className="truncate text-caption text-[var(--fg-muted)]">{maskKey(apiKey)} · in this browser only</span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => setApiKey(null)}>
              Remove key
            </Button>
          </div>
          <SiteForm apiKey={apiKey} />
        </>
      ) : (
        <KeyForm onSave={setApiKey} />
      )}
      <MadeLooks />
    </div>
  )
}
