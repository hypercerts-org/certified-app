/**
 * Orchestration for the sidebar EndorseButton's reason-modal confirm.
 *
 * quality-048: the award is created first; the optional list-append is
 * best-effort. The ordering here matters — `refetchGiven` runs right
 * after the award succeeds (before the list-append) so that a failing
 * append can't roll the optimistic "Endorsed" state back to "Endorse"
 * and nudge a duplicate endorsement. On an award failure we DO clear
 * the optimistic flag (nothing landed). On a list-append failure we
 * keep optimistic=true and surface only the list-attribution error.
 *
 * Extracted from the component so the create → refetch → append
 * ordering and its error handling are unit-testable without standing
 * up the hooks, modal, and atproto network stack.
 */
export interface EndorseReasonConfirmDeps {
  /** Trimmed endorsement note (may be empty). */
  note: string
  /** Chosen list rkey, or null when no list was selected. */
  listRkey: string | null
  /** Creates the endorsement award; resolves to its strong ref. */
  createAward: (note: string) => Promise<{ uri: string; cid: string }>
  /** Appends the award to the chosen list. May throw on conflict. */
  appendToList: (
    listRkey: string,
    award: { uri: string; cid: string },
  ) => Promise<unknown>
  /** Re-pages the viewer's given-endorsements set. */
  refetchGiven: () => Promise<unknown>
  /** Re-pages the viewer's endorsement lists. */
  refetchLists: () => Promise<unknown>
  /** Optimistic "Endorsed" flag setter on the button. */
  setOptimistic: (value: boolean | null) => void
}

export async function runEndorseReasonConfirm(
  deps: EndorseReasonConfirmDeps,
): Promise<void> {
  const {
    note,
    listRkey,
    createAward,
    appendToList,
    refetchGiven,
    refetchLists,
    setOptimistic,
  } = deps

  let award: { uri: string; cid: string }
  try {
    award = await createAward(note)
  } catch (err) {
    // The award never landed — roll the optimistic flip back so the
    // button returns to "Endorse" and rethrow so the modal shows the
    // error and stays open.
    console.error("Endorse failed:", err)
    setOptimistic(null)
    throw err
  }

  // The award succeeded and is now authoritative. Refetch the given set
  // BEFORE the optional list-append so a failing append can't snap the
  // button back to "Endorse" (which would nudge a duplicate award).
  await refetchGiven()

  if (listRkey) {
    // Best-effort: the endorsement itself already succeeded. If the
    // list append fails (network blip, PDS conflict on a concurrent
    // edit, …) we keep optimistic=true and surface ONLY the list-
    // attribution error — the user can retry the list add from the
    // list page without re-endorsing.
    await appendToList(listRkey, { uri: award.uri, cid: award.cid })
    await refetchLists()
  }
}
