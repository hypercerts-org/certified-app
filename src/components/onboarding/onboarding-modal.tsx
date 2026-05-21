"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
import StepDone from "./steps/step-done"
import { useOnboardingCommit, type CommitState } from "./use-onboarding-commit"

type StepKey = "profile" | "graph" | "done"

const STEP_ORDER: readonly StepKey[] = ["profile", "graph", "done"] as const

const STEP_LABELS: Record<StepKey, string> = {
  profile: "Your profile",
  graph: "Your follows",
  done: "Finish",
}

/**
 * First-signin onboarding modal. Renders globally via the layout, opens
 * automatically when `useOnboarding().isOpen` flips (gate handled by
 * the provider), and can also be opened by hand from the profile banner
 * or settings card.
 *
 * Three steps with a single batched commit at the end:
 *   1. Profile — confirm/edit bsky-seeded display name, bio, pronouns,
 *      avatar, banner.
 *   2. Follows — decide whether to copy Bluesky follows over.
 *   3. Finish — run the commit (clone blobs → putProfile → optional
 *      sync), show progress + result.
 *
 * The modal returns `null` when not open so it's cheap to mount
 * globally even for users who'll never see it.
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
  // True once Step 2 has finished a sync (success). Gates the
  // Continue button on Step 2 — users who opt-in to import must let
  // it complete before advancing, while Skip lets them through
  // immediately.
  const [syncDone, setSyncDone] = useState(false)

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
    setSyncDone(false)
    setStep("profile")
  }, [isOpen, did, bskySeed])

  // Reset the seeded marker when the modal closes so reopening for a
  // different DID gets fresh seed values.
  useEffect(() => {
    if (!isOpen) {
      seededForDid.current = null
    }
  }, [isOpen])

  // Lift the social-graph comparison up so Step 2 can render stats
  // inline AND Step 3's commit can call importDids on the same hook
  // instance (no double-fetch, no race between the two steps).
  // The hook safely no-ops when `did` is empty; we still mount it
  // unconditionally so the comparison is already in flight by the
  // time the user lands on Step 2.
  const sync = useSocialGraphSync(did ?? "", { ownDid: did ?? "" })

  const commit = useOnboardingCommit({
    did,
    onSuccess: completeOnboarding,
  })

  const advance = useCallback(() => {
    const i = STEP_ORDER.indexOf(step)
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1])
  }, [step])

  const goBack = useCallback(() => {
    const i = STEP_ORDER.indexOf(step)
    if (i > 0) setStep(STEP_ORDER[i - 1])
  }, [step])

  const handleClose = useCallback(() => {
    // While a commit is in flight, ESC / backdrop / Close button do
    // nothing — finish first, or the user can refresh to abort.
    if (commit.state.status === "running") return
    dismissOnboarding()
  }, [commit.state.status, dismissOnboarding])

  const runCommit = useCallback(async () => {
    await commit.run(profileDraft)
  }, [commit, profileDraft])

  if (!isOpen) return null
  if (!did) return null

  return (
    <AppDialog
      ariaLabel="Welcome to Certified"
      className="onboarding-modal"
      maxWidth={640}
      onClose={handleClose}
      disableBackdropClose={commit.state.status === "running"}
    >
      <header className="onboarding-modal__header">
        <h2 className="onboarding-modal__title">Welcome to Certified</h2>
        <p className="onboarding-modal__subtitle">
          {step === "profile"
            ? "Edit your profile."
            : step === "graph"
              ? "Bring your Bluesky follows to Certified."
              : "One tap to wrap up."}
        </p>
        <ol className="onboarding-modal__steps" aria-label="Onboarding steps">
          {STEP_ORDER.map((s, i) => (
            <li
              key={s}
              aria-current={s === step ? "step" : undefined}
            >
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
                  // Free-form navigation: clicking any step jumps
                  // there. Step 2's running-sync edge case is
                  // handled by step-graph's unmount-abort.
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
        ) : step === "graph" ? (
          <StepGraph
            stats={sync.stats}
            isLoading={sync.isLoading}
            truncated={sync.truncated}
            error={sync.error}
            intent={graphIntent}
            onChange={(i) => {
              setGraphIntent(i)
              // Switching choice after a sync has run resets the
              // gate — but in practice this only fires while the
              // runner is idle (choices unmount once started).
              if (i.kind === "skip") setSyncDone(false)
            }}
            importDids={sync.importDids}
            onSyncDone={() => setSyncDone(true)}
          />
        ) : (
          <StepDone
            draft={profileDraft}
            commit={commit.state}
            onRun={runCommit}
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
              : step === "graph"
                ? graphIntent.kind === "skip" || syncDone
                : true
          }
          onBack={goBack}
          onContinue={advance}
          onSkip={handleClose}
          onFinish={runCommit}
          onDone={handleClose}
        />
      </footer>
    </AppDialog>
  )
}

interface FooterActionsProps {
  readonly step: StepKey
  readonly commit: CommitState
  readonly canContinue: boolean
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
  onFinish: () => void
  onDone: () => void
}

function FooterActions({
  step,
  commit,
  canContinue,
  onBack,
  onContinue,
  onSkip,
  onFinish,
  onDone,
}: FooterActionsProps) {
  if (step === "done") {
    if (commit.status === "success") {
      return (
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      )
    }
    if (commit.status === "running") {
      return (
        <Button variant="primary" disabled loading>
          Finishing…
        </Button>
      )
    }
    return (
      <>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" onClick={onFinish}>
          {commit.status === "error" ? "Try again" : "Finish"}
        </Button>
      </>
    )
  }
  return (
    <>
      <Button variant="ghost" onClick={onSkip}>
        Skip for now
      </Button>
      <span style={{ flex: 1 }} />
      {step !== "profile" ? (
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      ) : null}
      <Button
        variant="primary"
        onClick={onContinue}
        disabled={!canContinue}
      >
        Continue
      </Button>
    </>
  )
}
