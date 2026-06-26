"use client";

import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog";
import Visualization from "@/components/visualization/visualization";

/**
 * A large modal that hosts the live endorsement graph (the self-contained
 * `Visualization`, same component the /endorsement-graph page renders). Opened
 * from the Help FAQ so people can poke at the web of trust without leaving the
 * page. `Visualization` fetches its own data and the graph carries a 60vh
 * min-height, so the dialog just needs to be wide and let it fill.
 */
export default function EndorsementGraphModal({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <AppDialog
      ariaLabel="Endorsement graph"
      maxWidth="min(1040px, 94vw)"
      onClose={onClose}
    >
      <AppDialogHeader title="Endorsement graph" onClose={onClose} />
      {/* `.viz` carries its own 16px gutter, so zero the body padding. */}
      <div className="endorsement-graph-modal__body">
        <Visualization />
      </div>
    </AppDialog>
  );
}
