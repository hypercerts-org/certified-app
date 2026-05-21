"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Sparkles } from "lucide-react"
import AppDialog from "@/components/ui/app-dialog"
import Button from "@/components/ui/button"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useOnboarding } from "@/lib/onboarding/onboarding-context"
import { useSocialGraphSync } from "@/hooks/use-social-graph-sync"
import StepProfile, {
  type ProfileDraft,
  emptyProfileDraft,
} from "./steps/step-profile"
import StepGraph, { type GraphIntent } from "./steps/step-graph"
import {
  useOnboardingCommit,
  type CommitState,
  type SyncRequest,
} from "./use-onboarding-commit"

type StepKey = "profile" | "graph"

const STEP_ORDER: readonly StepKey[] = ["profile", "graph"] as const

const STEP_LABELS: Record<StepKey, string> = {
  profile: "Your profile",
  graph: "Your follows",
}

/** Per-step modal-header copy. Lives at the top of the modal as a
 *  banner-styled row that mirrors the profile-page banner's
 *  relative sizing. */
const STEP_TITLES: Record<StepKey, string> = {
  profile: "Welcome to Certified",
  graph: "Import your Bluesky follows",
}

/**
 * First-signin onboarding modal. Two steps + a celebratory success
 * screen. The footer's primary button is dual-purpose: on Step 1
 * it's "Continue", on Step 2 it labels the actual finish action
 * based on the selected sync intent.
 */
export default function OnboardingModal() {
  const { isOpen, bskySeed, dismissOnboarding, completeOnboarding } =
    useOnboarding()
  const { did } = useAuth()
  const { handle } = useSession()

  const [step, setStep] = useState<StepKey>("profile")
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() =>
    emptyProfileDraft(),
  )
  const [graphIntent, setGraphIntent] = useState<GraphIntent>({
    kind: "skip",
  })
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  // Seed the profile draft from bsky values the first time the modal
  // opens for this DID. Subsequent re-opens (banner clicks) keep
  // whatever the user already typed.
  const seededForDid = useRef<string | null>(null)
  useEffect(() => {
    if (!isOpen) return
    if (!did) return
    if (seededForDid.current === did) return
    seededForDid.current = did
    setProfileDraft({
      displayName: bskySeed?.displayName?.trim() ?? "",
      description: bskySeed?.description?.trim() ?? "",
      website: "",
      sourceAvatarUrl: bskySeed?.avatar ?? null,
      sourceBannerUrl: bskySeed?.banner ?? null,
      replacementAvatarFile: null,
      replacementBannerFile: null,
    })
    setGraphIntent({ kind: "skip" })
    setSelected(new Set())
    setStep("profile")
  }, [isOpen, did, bskySeed])

  useEffect(() => {
    if (!isOpen) seededForDid.current = null
  }, [isOpen])

  // Lifted to the modal so Step 2 can render stats inline and the
  // commit pipeline shares the same hook instance during in-place
  // imports (no double-fetch).
  const sync = useSocialGraphSync(did ?? "", { ownDid: did ?? "" })

  const commit = useOnboardingCommit({
    did,
    onSuccess: completeOnboarding,
  })

  const runCommit = useCallback(
    async (syncReq: SyncRequest) => {
      await commit.run(profileDraft, syncReq)
    },
    [commit, profileDraft],
  )

  // The Finish path: dispatches based on the user's graph intent.
  // Skip → no sync, just commit. Import all → sync the entire bsky-
  // only candidate set, then commit. Pick specific → sync the picked
  // DIDs, then commit. The commit hook publishes per-stage status so
  // the footer button + Step 2 progress tile can label the moment.
  const dispatchFinish = useCallback(() => {
    if (graphIntent.kind === "skip") {
      void runCommit({ kind: "skip" })
      return
    }
    const dids =
      graphIntent.kind === "all"
        ? sync.stats.onlyBluesky
        : Array.from(selected)
    if (dids.length === 0) {
      void runCommit({ kind: "skip" })
      return
    }
    void runCommit({
      kind: "import",
      dids,
      importDids: sync.importDids,
    })
  }, [graphIntent, sync.stats.onlyBluesky, sync.importDids, selected, runCommit])

  const advance = useCallback(() => {
    const i = STEP_ORDER.indexOf(step)
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1])
  }, [step])

  const goBack = useCallback(() => {
    const i = STEP_ORDER.indexOf(step)
    if (i > 0) setStep(STEP_ORDER[i - 1])
  }, [step])

  const handleClose = useCallback(() => {
    if (commit.state.status === "running") return
    dismissOnboarding()
  }, [commit.state.status, dismissOnboarding])

  if (!isOpen) return null
  if (!did) return null

  // Success state takes over the whole modal — no steps, no body,
  // just celebration. Button does a full reload so resolve-did's
  // 10s own-DID cache doesn't serve stale data to the profile page.
  if (commit.state.status === "success") {
    const previewUrl =
      (profileDraft.replacementAvatarFile
        ? URL.createObjectURL(profileDraft.replacementAvatarFile)
        : profileDraft.sourceAvatarUrl) || null
    const goToProfile = () => {
      const target = handle ? `/profile/${encodeURIComponent(handle)}` : "/"
      window.location.assign(target)
    }
    return (
      <AppDialog
        ariaLabel="Welcome to Certified"
        className="onboarding-modal onboarding-modal--success"
        maxWidth={520}
        onClose={goToProfile}
      >
        <div className="onboarding-success">
          <div className="onboarding-success__halo" aria-hidden>
            <Sparkles size={28} strokeWidth={1.5} />
          </div>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              aria-hidden
              className="onboarding-success__avatar"
            />
          ) : (
            <div className="onboarding-success__avatar onboarding-success__avatar--empty">
              {(profileDraft.displayName || handle || "?")
                .slice(0, 1)
                .toUpperCase()}
            </div>
          )}
          <h2 className="onboarding-success__title">
            Welcome, {profileDraft.displayName.trim() || handle || "friend"}
          </h2>
          <p className="onboarding-success__subtitle">
            Your Certified profile is live. Go say hi.
          </p>
          <Button variant="primary" onClick={goToProfile}>
            Take me to my profile
          </Button>
        </div>
      </AppDialog>
    )
  }

  return (
    <AppDialog
      ariaLabel={STEP_TITLES[step]}
      className="onboarding-modal"
      maxWidth={640}
      onClose={handleClose}
      disableBackdropClose={commit.state.status === "running"}
    >
      <header className="onboarding-modal__header">
        {/* Banner-styled title row — mirrors the .onboarding-banner
            on the profile page so the modal feels like an expansion
            of the same affordance, at the same relative sizing. */}
        <div className="onboarding-modal__banner">
          <Sparkles
            size={18}
            strokeWidth={1.75}
            aria-hidden
            className="onboarding-modal__banner-icon"
          />
          <h2 className="onboarding-modal__banner-title">
            {STEP_TITLES[step]}
          </h2>
        </div>
        <ol className="onboarding-modal__steps" aria-label="Onboarding steps">
          {STEP_ORDER.map((s, i) => (
            <li key={s} aria-current={s === step ? "step" : undefined}>
              <button
                type="button"
                className={`onboarding-modal__step${
                  s === step ? " onboarding-modal__step--current" : ""
                }${
                  STEP_ORDER.indexOf(step) > i
                    ? " onboarding-modal__step--done"
                    : ""
                }`}
                onClick={() => {
                  if (commit.state.status === "running") return
                  setStep(s)
                }}
                disabled={commit.state.status === "running"}
              >
                <span className="onboarding-modal__step-index">{i + 1}</span>
                <span className="onboarding-modal__step-label">
                  {STEP_LABELS[s]}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </header>

      <div className="onboarding-modal__body">
        {step === "profile" ? (
          <StepProfile
            draft={profileDraft}
            onChange={setProfileDraft}
            handle={handle ?? undefined}
          />
        ) : (
          <StepGraph
            stats={sync.stats}
            isLoading={sync.isLoading}
            truncated={sync.truncated}
            error={sync.error}
            intent={graphIntent}
            onChange={setGraphIntent}
            selected={selected}
            setSelected={setSelected}
            commit={commit.state}
          />
        )}
      </div>

      <footer className="onboarding-modal__footer">
        <FooterActions
          step={step}
          commit={commit.state}
          canContinue={
            step === "profile"
              ? profileDraft.displayName.trim().length > 0
              : true
          }
          finishLabel={
            step === "graph"
              ? graphFinishLabel(graphIntent, sync.stats.onlyBluesky.length, selected.size)
              : null
          }
          finishDisabled={
            step === "graph" &&
            graphIntent.kind === "select" &&
            selected.size === 0
          }
          onBack={goBack}
          onContinue={advance}
          onFinish={dispatchFinish}
        />
      </footer>
    </AppDialog>
  )
}

/** Per-intent label for the Step 2 Finish button. */
function graphFinishLabel(
  intent: GraphIntent,
  candidateCount: number,
  selectedCount: number,
): string {
  if (intent.kind === "skip") return "Skip import and finish"
  if (intent.kind === "all") return `Import all ${candidateCount}`
  if (selectedCount === 0) return "Select people to import"
  return `Import ${selectedCount} selected`
}

interface FooterActionsProps {
  readonly step: StepKey
  readonly commit: CommitState
  readonly canContinue: boolean
  readonly finishLabel: string | null
  readonly finishDisabled: boolean
  onBack: () => void
  onContinue: () => void
  onFinish: () => void
}

function FooterActions({
  step,
  commit,
  canContinue,
  finishLabel,
  finishDisabled,
  onBack,
  onContinue,
  onFinish,
}: FooterActionsProps) {
  const isLastStep = step === STEP_ORDER[STEP_ORDER.length - 1]
  if (commit.status === "running") {
    return (
      <Button variant="primary" disabled loading>
        {commit.stage === "sync"
          ? "Importing follows…"
          : commit.stage === "profile-clone"
            ? "Saving avatar…"
            : "Finishing…"}
      </Button>
    )
  }
  return (
    <>
      <span style={{ flex: 1 }} />
      {step !== "profile" ? (
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      ) : null}
      <Button
        variant="primary"
        onClick={isLastStep ? onFinish : onContinue}
        disabled={isLastStep ? finishDisabled : !canContinue}
      >
        {isLastStep
          ? commit.status === "error"
            ? "Try again"
            : (finishLabel ?? "Finish")
          : "Continue"}
      </Button>
    </>
  )
}
