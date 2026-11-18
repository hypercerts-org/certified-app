"use client"

import {
  useId,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react"
import { Plus, Trash2, X } from "lucide-react"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import Input from "@/components/ui/input"
import Select from "@/components/ui/select"
import Skeleton from "@/components/ui/skeleton"
import Textarea from "@/components/ui/textarea"
import SectionHeader from "@/components/ui/section-header"
import LeafletEditor from "@/components/leaflet/leaflet-editor-dynamic"
import ImageEditOverlay from "@/components/feed/image-edit-overlay"
import { SectionTitleCount } from "@/components/create/form-action-bar"
import {
  ContributorIdentityField,
  isContributorIdentityAcceptable,
  isContributorWeightAcceptable,
  normalizeIdentity,
} from "@/components/create/contributor-identity-field"
import { ContributorIdentityCard } from "@/components/create/contributor-identity-card"
import type { RightsOptionsState } from "@/components/create/use-rights-options"
import { isAtprotoIdentity } from "@/hooks/use-contributor-info"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { countGraphemes } from "@/lib/utils/graphemes"
import type { LinearDocument } from "@/lib/leaflet/types"
import type { UploadedBlob } from "@/lib/atproto/profile"
import type { StrongRef } from "@/lib/atproto/location"

/**
 * The fields of the activity create and edit forms (`/create` and
 * `/{actor}/activity/{rkey}/edit`). Both pages own their state, loading and
 * submit; this renders the same inputs, labels and layout for both, so the
 * two forms can't drift apart.
 *
 * Desktop: the main column (title, short description, description,
 * contributors) with the details column on the right (image, time period,
 * work scope, locations, rights). The DOM has the main column first, so
 * the keyboard order is title, short description, description,
 * contributors, then the details; the grid places the details on the
 * right. Phones: one column in the order title, short description,
 * image, description, details, contributors (the CSS order lives under
 * `.create-cert` in cert-detail.css; there the image and details come
 * before the contributors on screen but after them in keyboard order).
 */

// Lexicon caps: title.maxLength = 256, shortDescription maxGraphemes = 300.
// The minimums are a product floor, not a lexicon constraint.
export const ACTIVITY_TITLE_MIN = 5
export const ACTIVITY_TITLE_MAX = 256
export const ACTIVITY_SHORT_DESC_MIN = 100
export const ACTIVITY_SHORT_DESC_MAX = 300

export interface ContributorRow {
  /** Stable key: survives reorders and removal. */
  key: string
  identity: string
  weight: string
  role: string
  /** True once the identity is "committed": prefilled from a saved
   *  record, a typeahead pick, Enter, or blur with a valid value. Drives
   *  whether the row shows the contributor card (true) or the typeahead
   *  (false). New rows start uncommitted so the user can keep typing past
   *  intermediate matches like `alice.so` on the way to `alice.social`. */
  picked: boolean
}

export function freshContributor(): ContributorRow {
  return {
    key: `contrib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    identity: "",
    weight: "",
    role: "",
    picked: false,
  }
}

/** Identities (normalised, lowercased) that appear on more than one row. */
export function duplicateContributorIdentities(
  contributors: ContributorRow[],
): Set<string> {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const c of contributors) {
    const norm = normalizeIdentity(c.identity).toLowerCase()
    if (!norm) continue
    if (seen.has(norm)) dupes.add(norm)
    seen.add(norm)
  }
  return dupes
}

/**
 * Whether the short description's minimum applies. Always on /create; on
 * edit (`saved` is the published summary) only once the summary has been
 * changed, so a record published under the minimum can still be saved
 * with its other fields edited. An empty saved summary is no exemption.
 */
export function shortDescriptionMinApplies(value: string, saved?: string): boolean {
  if (saved === undefined) return true
  const before = saved.trim()
  return before.length === 0 || value.trim() !== before
}

/**
 * What still stands between the form and a save, in the words the action
 * bar shows ("Before publishing: …"), plus the first text field to focus.
 * Dates use the sortable YYYY-MM-DD shape of `<input type="date">`, so a
 * string comparison is a calendar comparison; equal dates are fine.
 * `savedShortDescription` (edit only): the published summary; the
 * minimum then applies only once it has been changed.
 */
export function activityFormProblems(values: {
  title: string
  shortDescription: string
  savedShortDescription?: string
  startDate: string
  endDate: string
  contributors: ContributorRow[]
}): { unmet: string[]; focus: "title" | "shortDescription" | null } {
  const title = countGraphemes(values.title.trim())
  const titleOver = countGraphemes(values.title) > ACTIVITY_TITLE_MAX
  const shortDescUnder =
    shortDescriptionMinApplies(values.shortDescription, values.savedShortDescription) &&
    countGraphemes(values.shortDescription.trim()) < ACTIVITY_SHORT_DESC_MIN
  const shortDescOver =
    countGraphemes(values.shortDescription) > ACTIVITY_SHORT_DESC_MAX
  const contributorsValid = values.contributors.every(
    (c) =>
      isContributorIdentityAcceptable(c.identity) &&
      isContributorWeightAcceptable(c.weight),
  )
  const noDuplicates =
    duplicateContributorIdentities(values.contributors).size === 0
  const datesValid =
    !values.startDate || !values.endDate || values.startDate <= values.endDate

  const titleBad = title < ACTIVITY_TITLE_MIN || titleOver
  const shortDescBad = shortDescUnder || shortDescOver
  const unmet = [
    title < ACTIVITY_TITLE_MIN &&
      `the title needs at least ${ACTIVITY_TITLE_MIN} characters`,
    titleOver &&
      `the title must be ${ACTIVITY_TITLE_MAX} characters or fewer`,
    shortDescUnder &&
      `the short description needs at least ${ACTIVITY_SHORT_DESC_MIN} characters`,
    shortDescOver &&
      `the short description must be ${ACTIVITY_SHORT_DESC_MAX} characters or fewer`,
    !contributorsValid && "fix the highlighted contributor rows",
    !noDuplicates && "remove duplicate contributors",
    !datesValid && "the end date must be on or after the start date",
  ].filter((m): m is string => !!m)

  return {
    unmet,
    focus: titleBad ? "title" : shortDescBad ? "shortDescription" : null,
  }
}

export interface ActivityFormLocation {
  ref: StrongRef
  name: string
}

export interface ActivityFormFieldsProps {
  title: string
  onTitleChange: (value: string) => void
  titleRef?: RefObject<HTMLInputElement | null>
  /** Product-tour anchor on the title field. */
  titleTourId?: string
  shortDescription: string
  onShortDescriptionChange: (value: string) => void
  shortDescriptionRef?: RefObject<HTMLTextAreaElement | null>
  /** Edit only: the published summary. Its minimum then applies only once
   *  the summary has been changed (`shortDescriptionMinApplies`). */
  savedShortDescription?: string
  /** Flag every under-minimum count, edited or not (after a save attempt).
   *  Otherwise a count only turns red once its field has been left with
   *  text in it (blur), then follows the typing live; a saved record
   *  doesn't open with errors. */
  showAllErrors?: boolean

  description: LinearDocument | null
  onDescriptionChange: (doc: LinearDocument) => void
  descriptionPlaceholder: string
  /** Repo that owns blobs embedded in the description (editor preview). */
  editorDid: string
  onEditorImageUpload: (file: File) => Promise<UploadedBlob>

  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  workScope: string
  onWorkScopeChange: (value: string) => void

  /** The image shown in the slot (a staged preview or the saved image). */
  imageUrl: string | null
  hasPendingImage: boolean
  hasImage: boolean
  onImageFile: (file: File) => Promise<void>
  onImageRemove: () => void

  locations: ActivityFormLocation[]
  onRemoveLocation: (uri: string) => void
  onAddLocation: () => void

  rights: RightsOptionsState
  rightsUri: string
  onRightsChange: (uri: string) => void

  contributors: ContributorRow[]
  setContributors: Dispatch<SetStateAction<ContributorRow[]>>
  /** The publishing identity, for the "Add me" shortcut. */
  selfDid: string | null
}

export function ActivityFormFields(props: ActivityFormFieldsProps) {
  const {
    title,
    onTitleChange,
    titleRef,
    titleTourId,
    shortDescription,
    onShortDescriptionChange,
    shortDescriptionRef,
    savedShortDescription,
    showAllErrors = false,
    description,
    onDescriptionChange,
    descriptionPlaceholder,
    editorDid,
    onEditorImageUpload,
    startDate,
    endDate,
    onStartDateChange,
    onEndDateChange,
    workScope,
    onWorkScopeChange,
    imageUrl,
    hasPendingImage,
    hasImage,
    onImageFile,
    onImageRemove,
    locations,
    onRemoveLocation,
    onAddLocation,
    rights,
    rightsUri,
    onRightsChange,
    contributors,
    setContributors,
    selfDid,
  } = props

  const id = useId()
  // One rule for every form (DESIGN.md §9.2): a field's error shows once
  // it has been left (blur) or after a save attempt, then follows the
  // typing live. Until then its count stays grey: no red from the first
  // keystroke, and an untouched saved record doesn't open with errors.
  const [touched, setTouched] = useState({ title: false, shortDescription: false })
  const markTouched = (field: keyof typeof touched) =>
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }))

  const titleCount = countGraphemes(title)
  const titleTrimmed = countGraphemes(title.trim())
  const titleOver = titleCount > ACTIVITY_TITLE_MAX
  const titleUnder =
    (touched.title || showAllErrors) &&
    (titleTrimmed > 0 || showAllErrors) &&
    titleTrimmed < ACTIVITY_TITLE_MIN

  const shortDescCount = countGraphemes(shortDescription)
  const shortDescTrimmed = countGraphemes(shortDescription.trim())
  const shortDescOver = shortDescCount > ACTIVITY_SHORT_DESC_MAX
  const shortDescUnder =
    (touched.shortDescription || showAllErrors) &&
    (shortDescTrimmed > 0 || showAllErrors) &&
    shortDescriptionMinApplies(shortDescription, savedShortDescription) &&
    shortDescTrimmed < ACTIVITY_SHORT_DESC_MIN

  // Editing a published summary: the minimum applies only once it has
  // been changed, so say so, with the way back (undo the change).
  const changedSummaryUnder =
    shortDescUnder && savedShortDescription !== undefined && savedShortDescription.trim() !== ""

  const datesValid = !startDate || !endDate || startDate <= endDate

  const counterClass = (over: boolean, under: boolean) =>
    `create-cert__counter${
      over ? " create-cert__counter--over" : under ? " create-cert__counter--under" : ""
    }`

  // Rights: hidden when the publisher offers nothing to pick.
  const showRights =
    rights.isLoading || !!rights.error || rights.options.length > 0

  return (
    <article className="page-layout cert-detail--wide create-cert">
      <div className="page-layout__main cert-detail__main">
        <div className="create-cert__field create-cert__field--title">
          <label htmlFor={`${id}-title`} className="cert-detail__meta-label">
            Title
          </label>
          {/* The record title's serif role (h3 step), so the draft reads
              like the page it publishes to. */}
          <Input
            flush
            ref={titleRef}
            id={`${id}-title`}
            type="text"
            aria-describedby={`${id}-title-count`}
            aria-invalid={titleOver || titleUnder || undefined}
            placeholder="Title for your activity"
            className="font-headline !text-h3"
            value={title}
            maxLength={ACTIVITY_TITLE_MAX}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={() => markTouched("title")}
            data-tour={titleTourId}
          />
          <p id={`${id}-title-count`} className={counterClass(titleOver, titleUnder)}>
            {titleCount}/{ACTIVITY_TITLE_MAX} · min. {ACTIVITY_TITLE_MIN} characters
          </p>
        </div>

        <div className="create-cert__field create-cert__field--summary">
          <label htmlFor={`${id}-summary`} className="cert-detail__meta-label">
            Short description
          </label>
          <Textarea
            flush
            ref={shortDescriptionRef}
            id={`${id}-summary`}
            aria-describedby={
              changedSummaryUnder
                ? `${id}-summary-count ${id}-summary-min`
                : `${id}-summary-count`
            }
            aria-invalid={shortDescOver || shortDescUnder || undefined}
            placeholder="What was done, in two or three sentences."
            value={shortDescription}
            rows={3}
            onChange={(e) => onShortDescriptionChange(e.target.value)}
            onBlur={() => markTouched("shortDescription")}
          />
          <p
            id={`${id}-summary-count`}
            className={counterClass(shortDescOver, shortDescUnder)}
          >
            {shortDescCount}/{ACTIVITY_SHORT_DESC_MAX} · min.{" "}
            {ACTIVITY_SHORT_DESC_MIN} characters
          </p>
          {changedSummaryUnder ? (
            <p id={`${id}-summary-min`} className="create-cert__field-error">
              A changed summary needs at least {ACTIVITY_SHORT_DESC_MIN} characters. Undo
              your change to keep the current one.
            </p>
          ) : null}
        </div>

        <div className="create-cert__field create-cert__field--description">
          {/* The editor carries the same name as its aria-label. */}
          <span className="cert-detail__meta-label" aria-hidden>
            Description (optional)
          </span>
          <LeafletEditor
            value={description}
            onChange={onDescriptionChange}
            placeholder={descriptionPlaceholder}
            ariaLabel="Description (optional)"
            did={editorDid}
            onImageUpload={onEditorImageUpload}
          />
        </div>

        <ContributorsEditor
          contributors={contributors}
          setContributors={setContributors}
          selfDid={selfDid}
          showAllErrors={showAllErrors}
        />
      </div>

      {/* After the main column in the DOM, so the keyboard reaches the
          title first and the details after the contributors; from 800px
          the grid places this column on the right (cert-detail.css). */}
      <aside className="cert-detail__aside" aria-label="Activity details">
        <div
          className={`cert-detail__image cert-detail__image--editing${
            imageUrl ? "" : " cert-detail__image--empty"
          }`}
        >
          {/* Empty, the slot shows one affordance: the overlay's "Add
              image" pill (no glyph in the middle as well). */}
          {imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={imageUrl} alt="" className="cert-detail__image-img" />
          ) : null}
          <ImageEditOverlay
            onFile={onImageFile}
            hasPending={hasPendingImage}
            variant="with-remove"
            onRemove={onImageRemove}
            hasImage={hasImage}
          />
        </div>

        <div className="cert-detail__meta">
          <div
            className="cert-detail__meta-row"
            role="group"
            aria-labelledby={`${id}-period`}
          >
            <span id={`${id}-period`} className="cert-detail__meta-label">
              Time period (optional)
            </span>
            {/* Native date inputs keep the picker; their value is always
                ISO YYYY-MM-DD whatever the displayed locale format. */}
            <div className="create-cert__date-row">
              <Input
                flush
                type="date"
                aria-label="Start date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
              />
              <span aria-hidden>→</span>
              <Input
                flush
                type="date"
                aria-label="End date"
                error={
                  datesValid
                    ? undefined
                    : "End date must be on or after the start date."
                }
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
              />
            </div>
            {!datesValid ? (
              <p className="create-cert__field-error" role="alert">
                End date must be on or after the start date.
              </p>
            ) : null}
          </div>

          <div className="cert-detail__meta-row">
            <label htmlFor={`${id}-scope`} className="cert-detail__meta-label">
              Work scope (optional)
            </label>
            <Input
              flush
              id={`${id}-scope`}
              type="text"
              placeholder="e.g. mentorship, code review…"
              value={workScope}
              maxLength={256}
              onChange={(e) => onWorkScopeChange(e.target.value)}
            />
          </div>

          <div
            className="cert-detail__meta-row"
            role="group"
            aria-labelledby={`${id}-locations`}
          >
            <span id={`${id}-locations`} className="cert-detail__meta-label">
              Locations (optional)
              {locations.length > 0 ? (
                <span className="cert-detail__meta-count">{locations.length}</span>
              ) : null}
            </span>
            {locations.length > 0 ? (
              <ul className="create-cert__loc-list">
                {locations.map((loc) => (
                  <li key={loc.ref.uri} className="create-cert__loc-row">
                    <span className="create-cert__loc-name">{loc.name}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${loc.name}`}
                      onClick={() => onRemoveLocation(loc.ref.uri)}
                    >
                      <X size={16} strokeWidth={1.75} aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div>
              <Button type="button" variant="secondary" size="sm" onClick={onAddLocation}>
                <Plus size={16} strokeWidth={1.75} aria-hidden />
                Add location
              </Button>
            </div>
          </div>

          {showRights ? (
            <div className="cert-detail__meta-row">
              <label htmlFor={`${id}-rights`} className="cert-detail__meta-label">
                Rights
              </label>
              {rights.isLoading ? (
                <Skeleton variant="line" width="100%" height="2.75rem" />
              ) : rights.error ? (
                <EmptyState variant="inline" title="Couldn't load the rights options.">
                  <Button variant="ghost" size="sm" onClick={rights.retry}>
                    Try again
                  </Button>
                </EmptyState>
              ) : (
                <Select
                  id={`${id}-rights`}
                  value={rightsUri}
                  onChange={(e) => onRightsChange(e.target.value)}
                >
                  <option value="">No rights</option>
                  {rights.options.map((opt) => (
                    <option key={opt.ref.uri} value={opt.ref.uri}>
                      {opt.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          ) : null}
        </div>
      </aside>
    </article>
  )
}

/**
 * The Contributors section: one block per contributor (who, then their
 * role and share), one remove button per block, then "Add contributor"
 * and "Add me". `id="contributors"` is the target of Records' "Contributors…"
 * link (`…/edit#contributors`).
 */
function ContributorsEditor({
  contributors,
  setContributors,
  selfDid,
  showAllErrors,
}: {
  contributors: ContributorRow[]
  setContributors: Dispatch<SetStateAction<ContributorRow[]>>
  selfDid: string | null
  /** After a save attempt: every unrecognisable row shows its error. */
  showAllErrors: boolean
}) {
  const id = useId()
  // Rows whose typed value was offered as final (blur, or Enter without a
  // pick) and isn't a handle: they show the error until the next edit.
  // Never while typing with suggestions open.
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  // Rows whose share field has been left once: from then on its "not a
  // number" error follows the typing live (before that, only a save
  // attempt shows it).
  const [shareLeft, setShareLeft] = useState<ReadonlySet<string>>(new Set())
  const markShareLeft = (key: string) =>
    setShareLeft((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))
  const setRowChecked = (key: string, on: boolean) =>
    setChecked((prev) => {
      if (prev.has(key) === on) return prev
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  // "Add me" names whoever is publishing: the group while acting as one,
  // otherwise the signed-in account (handle preferred, DID as fallback).
  const { info: selfInfo } = useAuthorInfo(selfDid)
  const duplicates = duplicateContributorIdentities(contributors)

  const update = (key: string, patch: Partial<ContributorRow>) =>
    setContributors((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    )

  let addMe: ReactNode = null
  if (selfInfo && (selfInfo.handle || selfInfo.did)) {
    const selfIdentity =
      selfInfo.handle && selfInfo.handle !== selfInfo.did
        ? `@${selfInfo.handle}`
        : selfInfo.did
    // A row may hold either the handle or the DID (a saved activity stores
    // DIDs; a typeahead pick stores a handle), so match both.
    const selfKeys = new Set(
      [selfInfo.handle, selfInfo.did]
        .filter((v): v is string => !!v)
        .map((v) => normalizeIdentity(v).toLowerCase()),
    )
    const alreadyAdded = contributors.some((c) =>
      selfKeys.has(normalizeIdentity(c.identity).toLowerCase()),
    )
    addMe = (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={alreadyAdded}
        onClick={() =>
          setContributors((rows) => [
            ...rows,
            { ...freshContributor(), identity: selfIdentity, picked: true },
          ])
        }
        title={
          alreadyAdded ? "Already on the list" : `Add ${selfIdentity} as a contributor`
        }
      >
        Add me
      </Button>
    )
  }

  return (
    <section
      id="contributors"
      className="cert-detail__section create-cert__contributors"
      aria-labelledby={`${id}-heading`}
    >
      <SectionHeader
        id={`${id}-heading`}
        title={<SectionTitleCount label="Contributors" count={contributors.length} />}
      />

      {contributors.length === 0 ? (
        <EmptyState
          variant="inline"
          title="No contributors yet."
          description="Add one to credit collaborators."
        />
      ) : (
        <ul className="create-cert__contrib-list">
          {contributors.map((c, idx) => {
            const n = idx + 1
            const identityValid = isContributorIdentityAcceptable(c.identity)
            // The "not a handle" error waits for blur, Enter or a save.
            const identityError =
              !identityValid && (showAllErrors || checked.has(c.key))
            const weightValid = isContributorWeightAcceptable(c.weight)
            const weightError =
              !weightValid && (showAllErrors || shareLeft.has(c.key))
            const normalized = normalizeIdentity(c.identity)
            const identityDuplicate =
              normalized.length > 0 && duplicates.has(normalized.toLowerCase())
            // The other rows' identities: the typeahead hides them so a
            // duplicate can't be picked (typing one still shows the
            // "Already added" error).
            const otherIdentities = new Set<string>()
            for (const other of contributors) {
              if (other.key === c.key) continue
              const o = normalizeIdentity(other.identity).toLowerCase()
              if (o) otherIdentities.add(o)
            }
            // The card replaces the typeahead only once the row is
            // committed; duplicates stay in input mode so the error shows.
            const showCard =
              c.picked &&
              identityValid &&
              !identityDuplicate &&
              normalized.length > 0 &&
              isAtprotoIdentity(normalized)
            const roleId = `${id}-${c.key}-role`
            const shareId = `${id}-${c.key}-share`
            const whoErrorId = `${id}-${c.key}-who-error`
            const shareErrorId = `${id}-${c.key}-share-error`
            return (
              <li key={c.key} className="create-cert__contrib-row">
                <div className="create-cert__contrib-who">
                  {showCard ? (
                    <ContributorIdentityCard
                      identity={normalized}
                      ariaLabel={`Contributor ${n}`}
                    />
                  ) : (
                    <ContributorIdentityField
                      value={c.identity}
                      onChange={(next) => {
                        setRowChecked(c.key, false)
                        update(c.key, { identity: next })
                      }}
                      onCommit={() => update(c.key, { picked: true })}
                      onCheck={() => setRowChecked(c.key, true)}
                      ariaLabel={`Contributor ${n}: name or handle`}
                      idx={idx}
                      invalid={identityError || identityDuplicate}
                      errorId={whoErrorId}
                      excludeIdentities={otherIdentities}
                    />
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove contributor ${n}`}
                  onClick={() =>
                    setContributors((rows) => rows.filter((r) => r.key !== c.key))
                  }
                >
                  <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                </Button>
                {/* Right under the field it is about (the row's grid puts
                    it on its own line, before Role and Share). */}
                {identityError ? (
                  <p id={whoErrorId} className="create-cert__field-error" role="alert">
                    Pick someone from the list, or type a full handle (like
                    name.certified.app).
                  </p>
                ) : identityDuplicate ? (
                  <p id={whoErrorId} className="create-cert__field-error" role="alert">
                    Already added. Each contributor can only appear once.
                  </p>
                ) : null}
                <div className="create-cert__contrib-fields">
                  <div className="create-cert__contrib-field">
                    <label htmlFor={roleId} className="cert-detail__meta-label">
                      <span>
                        Role <span className="sr-only">of contributor {n} </span>(optional)
                      </span>
                    </label>
                    <Input
                      flush
                      id={roleId}
                      type="text"
                      value={c.role}
                      maxLength={1000}
                      onChange={(e) => update(c.key, { role: e.target.value })}
                    />
                  </div>
                  <div className="create-cert__contrib-field create-cert__contrib-field--share">
                    <label htmlFor={shareId} className="cert-detail__meta-label">
                      <span>
                        Share <span className="sr-only">of contributor {n} in percent </span>(optional)
                      </span>
                    </label>
                    <Input
                      flush
                      id={shareId}
                      type="text"
                      inputMode="decimal"
                      trailingIcon={<span className="text-ui">%</span>}
                      error={weightError ? "Share must be a number." : undefined}
                      aria-describedby={weightError ? shareErrorId : undefined}
                      value={c.weight}
                      maxLength={100}
                      onChange={(e) => update(c.key, { weight: e.target.value })}
                      onBlur={() => markShareLeft(c.key)}
                    />
                  </div>
                </div>
                {weightError ? (
                  <p id={shareErrorId} className="create-cert__field-error" role="alert">
                    Share must be a number (decimals are fine, e.g. 12.5).
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <div className="create-cert__contrib-actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setContributors((rows) => [...rows, freshContributor()])}
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden />
          Add contributor
        </Button>
        {addMe}
      </div>
    </section>
  )
}
