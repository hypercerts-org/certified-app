"use client";

import { PartyPopper, Check } from "lucide-react";
import AppDialog, { AppDialogBody } from "@/components/ui/app-dialog";
import Button from "@/components/ui/button";

/**
 * Outcome modal for the two group lifecycle moments:
 *  - `created`: a small celebration after promoting an account to a group
 *    (popping badge + a confetti burst).
 *  - `removed`: a dry confirmation after a group is removed.
 * Stays inside the design language — serif headline, tokenized surfaces,
 * `var(--radius)` — and keeps the boldness to the one celebratory burst.
 */
export default function GroupResultModal({
  variant,
  handle,
  primaryLabel,
  onPrimary,
  onClose,
}: {
  variant: "created" | "removed";
  handle: string;
  primaryLabel: string;
  onPrimary: () => void;
  onClose: () => void;
}) {
  const created = variant === "created";

  return (
    <AppDialog
      ariaLabel={created ? "Group created" : "Group removed"}
      role="alertdialog"
      maxWidth={400}
      onClose={onClose}
    >
      <AppDialogBody>
        <div className="group-result">
          {created ? (
            <div className="group-result__confetti" aria-hidden>
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={`group-result__confetti-bit gr-c${i}`} />
              ))}
            </div>
          ) : null}

          <div className={`group-result__badge group-result__badge--${variant}`}>
            {created ? (
              <PartyPopper size={26} strokeWidth={1.75} aria-hidden />
            ) : (
              <Check size={26} strokeWidth={2} aria-hidden />
            )}
          </div>

          <h2 className="group-result__title">
            {created ? "You're a group now" : "Group removed"}
          </h2>

          <p className="group-result__body">
            {created ? (
              <>
                <strong>@{handle}</strong> is now a group, with you as its
                owner. Add members and assign roles whenever you&apos;re ready.
              </>
            ) : (
              <>
                <strong>@{handle}</strong> is no longer a group. The account,
                its handle, and its records remain — you can promote it to a
                group again later.
              </>
            )}
          </p>

          <Button variant="primary" onClick={onPrimary}>
            {primaryLabel}
          </Button>
        </div>
      </AppDialogBody>
    </AppDialog>
  );
}
