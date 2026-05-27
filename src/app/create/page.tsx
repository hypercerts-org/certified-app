"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Calendar, FileText, Plus, Target, Trash2 } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { authFetch } from "@/lib/auth/fetch"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import { PenLine, Building2 } from "lucide-react"
import type { LinearDocument } from "@/lib/leaflet/types"

/**
 * `/create` — new cert. Mirrors the visual language of the cert detail
 * page (`page-layout cert-detail--wide`) so the editing flow reads as
 * "you're shaping a draft cert that will look exactly like this when
 * published." Surfaces every field the
 * `org.hypercerts.claim.activity` lexicon supports as an inline form:
 *
 *   Required (lexicon-required):
 *     - title             (string, max 256)
 *     - shortDescription  (string, max 300 graphemes)
 *     - createdAt         (auto-stamped at submit)
 *
 *   Inline-editable here:
 *     - description       (Leaflet LinearDocument)
 *     - startDate         (datetime — emitted as ISO from a date input)
 *     - endDate           (datetime — same)
 *     - workScope         (free-form string → `#workScopeString` variant)
 *     - contributors[]    (inline `#contributorIdentity` rows with
 *                          optional weight + `#contributorRole`)
 *
 *   Deferred to post-create inline edit on the detail page:
 *     - image             (needs blob-upload UX; same shape activity-detail edits)
 *     - locations[]       (strongRefs to app.certified.location records;
 *                          location-record creation is its own flow)
 *     - rights            (strongRef to org.hypercerts.claim.rights record;
 *                          rights-record picker / creation is its own flow)
 *
 *   shortDescriptionFacets is derived at parse time elsewhere; the
 *   form itself stays plain-text.
 */

const AT_URI_RE = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/

interface ContributorRow {
  /** Stable key — survives reorders and the trash button. */
  key: string
  identity: string
  weight: string
  role: string
}

function freshContributor(): ContributorRow {
  return {
    key: `contrib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    identity: "",
    weight: "",
    role: "",
  }
}

export default function CreatePage() {
  const { isAuthenticated, did } = useAuth()
  const { activeOrg } = useOrg()
  const router = useRouter()

  const [arrivedFromInApp] = useState(() => {
    if (typeof window === "undefined") return false
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null
      return !!referrer && referrer.origin === window.location.origin
    } catch {
      return false
    }
  })

  // Scalar fields. Dates use the HTML date-input shape (YYYY-MM-DD)
  // and are upcast to ISO datetime at submit so the lexicon's
  // datetime format is respected.
  const [title, setTitle] = useState("")
  const [shortDescription, setShortDescription] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [workScope, setWorkScope] = useState("")
  const [description, setDescription] = useState<LinearDocument | null>(null)
  const [contributors, setContributors] = useState<ContributorRow[]>([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Grapheme counter — the lexicon caps shortDescription at 300
  // graphemes (not bytes). Intl.Segmenter is the right tool;
  // older browsers fall back to `Array.from(str).length` which
  // counts code points (close enough at the 300-cap range and
  // never overestimates).
  const shortDescGraphemes = useCallback((s: string): number => {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" })
      let count = 0
      for (const _ of seg.segment(s)) count++
      return count
    }
    return Array.from(s).length
  }, [])
  const shortDescCount = shortDescGraphemes(shortDescription)
  const SHORT_DESC_MAX = 300

  useEffect(() => {
    setError(null)
  }, [
    title,
    shortDescription,
    startDate,
    endDate,
    workScope,
    description,
    contributors,
  ])

  if (!isAuthenticated) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={PenLine}
              title="Sign in to create"
              description="You need to be signed in to create an activity claim."
            />
          </div>
        </div>
      </div>
    )
  }

  // Group context isn't supported yet — same constraint as before:
  // the xrpc proxy validates repo === session DID for write methods.
  if (activeOrg) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={Building2}
              title="Switch to your personal account"
              description="Creating activity claims as a group isn't supported yet. Use the account switcher to switch to your personal identity."
            />
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !shortDescription.trim() || !did) return
    if (shortDescCount > SHORT_DESC_MAX) return

    setIsSubmitting(true)
    setError(null)

    // Build the record payload. Optional fields are added only when
    // populated so the lexicon doesn't receive empty strings or
    // empty arrays that mean something different from "absent".
    type ClaimActivityRecord = {
      $type: "org.hypercerts.claim.activity"
      title: string
      shortDescription: string
      createdAt: string
      description?: LinearDocument
      startDate?: string
      endDate?: string
      workScope?: {
        $type: "org.hypercerts.claim.activity#workScopeString"
        scope: string
      }
      contributors?: Array<{
        contributorIdentity: {
          $type: "org.hypercerts.claim.activity#contributorIdentity"
          identity: string
        }
        contributionWeight?: string
        contributionDetails?: {
          $type: "org.hypercerts.claim.activity#contributorRole"
          role: string
        }
      }>
    }
    const record: ClaimActivityRecord = {
      $type: "org.hypercerts.claim.activity",
      title: title.trim(),
      shortDescription: shortDescription.trim(),
      createdAt: new Date().toISOString(),
    }
    if (description && description.blocks.length > 0) {
      record.description = description
    }
    if (startDate) {
      // YYYY-MM-DD → ISO datetime at start of day in UTC. The
      // lexicon stores datetime; midnight UTC is the conventional
      // "all we know is the date" anchor.
      record.startDate = new Date(`${startDate}T00:00:00.000Z`).toISOString()
    }
    if (endDate) {
      record.endDate = new Date(`${endDate}T00:00:00.000Z`).toISOString()
    }
    if (workScope.trim()) {
      record.workScope = {
        $type: "org.hypercerts.claim.activity#workScopeString",
        scope: workScope.trim(),
      }
    }
    const populatedContributors = contributors
      .filter((c) => c.identity.trim().length > 0)
      .map((c) => {
        const entry: NonNullable<ClaimActivityRecord["contributors"]>[number] = {
          contributorIdentity: {
            $type: "org.hypercerts.claim.activity#contributorIdentity",
            identity: c.identity.trim(),
          },
        }
        if (c.weight.trim()) entry.contributionWeight = c.weight.trim()
        if (c.role.trim()) {
          entry.contributionDetails = {
            $type: "org.hypercerts.claim.activity#contributorRole",
            role: c.role.trim(),
          }
        }
        return entry
      })
    if (populatedContributors.length > 0) {
      record.contributors = populatedContributors
    }

    try {
      const res = await authFetch("/api/xrpc/com/atproto/repo/createRecord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: did,
          collection: "org.hypercerts.claim.activity",
          record,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || `Failed: ${res.status}`)
      }

      const uri: unknown = data?.uri
      const match = typeof uri === "string" ? AT_URI_RE.exec(uri) : null
      if (match) {
        const [, ownerDid, , rkey] = match
        router.push(
          `/activity/${encodeURIComponent(ownerDid)}/${encodeURIComponent(rkey)}`,
        )
      } else {
        router.push("/")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setIsSubmitting(false)
    }
  }

  const canSubmit =
    title.trim().length > 0 &&
    shortDescription.trim().length > 0 &&
    shortDescCount <= SHORT_DESC_MAX &&
    !isSubmitting

  const overLimit = shortDescCount > SHORT_DESC_MAX

  return (
    <form onSubmit={handleSubmit}>
      <article className="page-layout cert-detail--wide create-cert">
        <aside className="cert-detail__aside" aria-label="Cert metadata">
          {/* Placeholder image slot — visual parity with the cert
              detail page. Image upload is a follow-up; the inline-
              edit flow on the detail page already supports it. */}
          <div className="cert-detail__image cert-detail__image--placeholder">
            <PenLine
              size={32}
              strokeWidth={1.25}
              aria-hidden
              className="cert-detail__image-placeholder-icon"
            />
          </div>

          <dl className="cert-detail__meta">
            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <Calendar size={11} strokeWidth={2} aria-hidden />
                Time period
              </dt>
              <dd className="cert-detail__meta-value">
                <div className="create-cert__date-row">
                  <input
                    type="date"
                    aria-label="Start date"
                    className="cert-detail__meta-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <span aria-hidden>→</span>
                  <input
                    type="date"
                    aria-label="End date"
                    className="cert-detail__meta-input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </dd>
            </div>

            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <Target size={11} strokeWidth={2} aria-hidden />
                Work scope
              </dt>
              <dd className="cert-detail__meta-value">
                <input
                  type="text"
                  aria-label="Work scope"
                  className="cert-detail__meta-input"
                  placeholder="e.g. mentorship, code review…"
                  value={workScope}
                  maxLength={256}
                  onChange={(e) => setWorkScope(e.target.value)}
                />
              </dd>
            </div>

            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <FileText size={11} strokeWidth={2} aria-hidden />
                Rights
              </dt>
              <dd className="cert-detail__meta-value">
                <span className="cert-detail__meta-aux">
                  Add after creating
                </span>
              </dd>
            </div>
          </dl>
        </aside>

        <div className="page-layout__main cert-detail__main">
          <header className="cert-detail__headline">
            <input
              type="text"
              className="cert-detail__title-input"
              aria-label="Title"
              placeholder="Title for your cert"
              value={title}
              maxLength={256}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </header>

          <section className="cert-detail__section">
            <textarea
              className="cert-detail__short-desc-input"
              value={shortDescription}
              placeholder="A short description (one or two lines)…"
              aria-label="Short description"
              onChange={(e) => setShortDescription(e.target.value)}
              rows={3}
              required
            />
            <p
              className={`create-cert__counter${
                overLimit ? " create-cert__counter--over" : ""
              }`}
              aria-live="polite"
            >
              {shortDescCount}/{SHORT_DESC_MAX}
            </p>
          </section>

          <section className="cert-detail__section">
            <div className="cert-detail__section-header">
              <h2 className="cert-detail__section-title">Description</h2>
            </div>
            <LeafletEditor
              value={description}
              onChange={setDescription}
              placeholder="Full description of this cert. Markdown-style headings, lists, and links are supported."
              ariaLabel="Cert description"
              did={did ?? ""}
            />
          </section>

          <section className="cert-detail__section">
            <div className="cert-detail__section-header">
              <h2 className="cert-detail__section-title">Contributors</h2>
              {contributors.length > 0 ? (
                <span className="cert-detail__section-count">
                  {contributors.length}
                </span>
              ) : null}
            </div>

            {contributors.length === 0 ? (
              <p className="cert-detail__empty-line">
                No contributors yet. Add one to credit collaborators.
              </p>
            ) : (
              <ul className="create-cert__contrib-list">
                {contributors.map((c, idx) => (
                  <li key={c.key} className="create-cert__contrib-row">
                    <input
                      type="text"
                      className="cert-detail__meta-input"
                      aria-label={`Contributor ${idx + 1} identity`}
                      placeholder="did:plc:… or @handle.example.com"
                      value={c.identity}
                      maxLength={1000}
                      onChange={(e) =>
                        setContributors((rows) =>
                          rows.map((r) =>
                            r.key === c.key
                              ? { ...r, identity: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                    <input
                      type="text"
                      className="cert-detail__meta-input create-cert__contrib-weight"
                      aria-label={`Contributor ${idx + 1} weight`}
                      placeholder="Weight"
                      value={c.weight}
                      maxLength={100}
                      onChange={(e) =>
                        setContributors((rows) =>
                          rows.map((r) =>
                            r.key === c.key
                              ? { ...r, weight: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                    <input
                      type="text"
                      className="cert-detail__meta-input"
                      aria-label={`Contributor ${idx + 1} role`}
                      placeholder="Role"
                      value={c.role}
                      maxLength={1000}
                      onChange={(e) =>
                        setContributors((rows) =>
                          rows.map((r) =>
                            r.key === c.key
                              ? { ...r, role: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="create-cert__contrib-remove"
                      aria-label={`Remove contributor ${idx + 1}`}
                      onClick={() =>
                        setContributors((rows) =>
                          rows.filter((r) => r.key !== c.key),
                        )
                      }
                    >
                      <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setContributors((rows) => [...rows, freshContributor()])
              }
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden />
              Add contributor
            </Button>
          </section>

          {/* Locations + image + rights aren't editable here yet; the
              detail-page inline-edit flow handles all three on the
              same cert after creation. A short note tells the user
              where to go so the gap doesn't feel hidden. */}
          <p className="create-cert__followup-note">
            Image, locations, and rights can be added on the cert page
            after you create it.
          </p>

          {error ? (
            <p className="cert-detail__error-desc" role="alert">
              {error}
            </p>
          ) : null}

          <div className="create-cert__actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (arrivedFromInApp) router.back()
                else router.push("/")
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              disabled={!canSubmit}
            >
              {isSubmitting ? "Publishing…" : "Publish cert"}
            </Button>
          </div>
        </div>
      </article>
    </form>
  )
}
