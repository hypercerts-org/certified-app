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
import { useOnboardingCommit, type CommitState } from "./use-onboarding-commit"

type StepKey = "profile" | "graph"

const STEP_ORDER: readonly StepKey[] = ["profile", "graph"] as const

const STEP_LABELS: Record<StepKey, string> = {
  profile: "Your profile",
  graph: "Your follows",
}

/**
 * First-signin onboarding modal. Renders globally via the layout, opens
 * automatically when `useOnboarding().isOpen` flips (gate handled by
 * the provider), and can also be opened by hand from the profile banner
 * or settings card.
 *
 * Two steps + a celebratory success screen:
 *   1. Profile — confirm/edit bsky-seeded display name, bio, avatar,
 *      banner.
 *   2. Follows — three-way intent (Import all / Pick specific / Skip).
 *      Sync runs in place on this step.
 *
 * The Finish button on Step 2 fires the profile commit (clone blobs →
 * putProfile). On success the modal swaps to a success screen that
 * shows the freshly-imported avatar + name.
 *
 * Returns `null` when not open so it's cheap to mount globally even
 * for users who'll never see it.
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
    setStep("profile")
  }, [isOpen, did, bskySeed])

  // Reset the seeded marker when the modal closes so reopening for a
  // different DID gets fresh seed values.
  useEffect(() => {
    if (!isOpen) {
      seededForDid.current = null
    }
  }, [isOpen])

  // Lifted to the modal so Step 2 can render stats inline and share
  // the same hook instance during in-place imports (no double-fetch).
  const sync = useSocialGraphSync(did ?? "", { ownDid: did ?? "" })

  const commit = useOnboardingCommit({
    did,
    onSuccess: completeOnboarding,
  })

  const runCommit = useCallback(async () => {
    await commit.run(profileDraft)
  }, [commit, profileDraft])

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

  if (!isOpen) return null
  if (!did) return null

  // Success state takes over the whole modal — no steps, no body,
  // just celebration.
  if (commit.state.status === "success") {
    const previewUrl =
      (profileDraft.replacementAvatarFile
        ? URL.createObjectURL(profileDraft.replacementAvatarFile)
        : profileDraft.sourceAvatarUrl) || null
    return (
      <AppDialog
        ariaLabel="Welcome to Certified"
        className="onboarding-modal onboarding-modal--success"
        maxWidth={520}
        onClose={handleClose}
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
          <Button variant="primary" onClick={handleClose}>
            Take me to my profile
          </Button>
        </div>
      </AppDialog>
    )
  }

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
            : "Bring your Bluesky follows to Certified. You can re-run this any time from Settings → Sync social graph."}
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
            importDids={sync.importDids}
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
          onBack={goBack}
          onContinue={advance}
          onFinish={runCommit}
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
  onFinish: () => void
}

function FooterActions({
  step,
  commit,
  canContinue,
  onBack,
  onContinue,
  onFinish,
}: FooterActionsProps) {
  const isLastStep = step === STEP_ORDER[STEP_ORDER.length - 1]
  if (commit.status === "running") {
    return (
      <Button variant="primary" disabled loading>
        Finishing…
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
        disabled={!canContinue}
      >
        {isLastStep
          ? commit.status === "error"
            ? "Try again"
            : "Finish"
          : "Continue"}
      </Button>
    </>
  )
}
