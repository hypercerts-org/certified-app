"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import Input, { type InputProps } from "./input";

/**
 * Generic typeahead Combobox primitive.
 *
 * This owns the *state machine* and *ARIA wiring* shared by every
 * typeahead surface in the app (global search, cert search, people
 * search, group handle search, the inline contributor identity
 * field). It does NOT fetch, merge, dedupe, group, or know anything
 * about row shape — each surface keeps its own data layer and renders
 * its own rows through the `renderOption` render prop.
 *
 * The model is CONTROLLED-ITEMS: the caller passes `items` already
 * merged/filtered into final render order, plus the typed `value` and
 * `open` state. The combobox derives the highlight index, handles the
 * keyboard (Arrow / Home / End / Enter / Escape), closes on outside
 * click, keeps the highlighted row scrolled into view, and emits the
 * full ARIA contract so screen readers see a conformant combobox +
 * listbox pair.
 *
 * Chrome: by default the editable control is the shared <Input> (so
 * leadingIcon / trailingButton / size / variant all compose for free).
 * Surfaces that need their own flush chrome (e.g. the inline
 * `cert-detail__meta-input`) can pass `renderInput` to render a bare
 * styled <input>; the combobox still owns its props and ARIA.
 */

export type ComboboxEscapeStage = "two-stage" | "close-only";

/**
 * Live-region copy. The combobox renders an sr-only polite region and
 * picks one of these strings based on `isLoading` / item count / typed
 * value. Pass `null` (or omit) to suppress announcements entirely.
 */
export interface ComboboxLiveStatus {
  /** Announced while `isLoading` is true. e.g. "Searching". */
  searching: string;
  /** Given the item count, return the announcement. e.g. (n) => `${n} results`. */
  results: (count: number) => string;
  /** Announced when not loading, zero items, and the user has typed. */
  empty: string;
}

/**
 * Props handed to the `renderOption` render prop for each item. The
 * surface returns the `<li role="option">` (or a fragment that
 * includes a group header above it). The combobox supplies the
 * stable option id (for `aria-activedescendant`), the highlight flag,
 * and pre-bound hover/select handlers so every surface wires its rows
 * the same way.
 */
export interface ComboboxOptionRenderProps<T> {
  item: T;
  index: number;
  highlighted: boolean;
  /** The id this row MUST set on its `<li id>` so activedescendant matches. */
  optionId: string;
  /** Bind to `onMouseEnter` — moves the highlight to this row. */
  onHover: () => void;
  /**
   * Bind to `onMouseDown` (not click). The combobox calls
   * `e.preventDefault()` for you and then `onSelect(item, index)` so
   * the input doesn't blur-close the listbox before selection runs.
   */
  onSelect: (e: React.MouseEvent) => void;
}

export interface ComboboxProps<T> {
  /** Current typed text (controlled). */
  value: string;
  /** Fired on every keystroke with the new input value. */
  onValueChange: (next: string) => void;

  /**
   * Items in final render order — already fetched, merged, deduped,
   * filtered, and (visually) grouped by the surface. The combobox
   * treats this as an opaque flat list for keyboard navigation; group
   * headers are the surface's concern (render them inside
   * `renderListHeader` or interleaved in `renderOption`).
   */
  items: readonly T[];
  /** Stable key for an item — used for the React list key only. */
  getItemKey: (item: T, index: number) => React.Key;

  /** True while the surface is fetching. Drives `aria-busy` + live status. */
  isLoading?: boolean;

  /** Open state of the listbox (controlled). */
  open: boolean;
  /** Requests an open-state change (outside click, Escape, selection). */
  onOpenChange: (open: boolean) => void;

  /**
   * Fired when the user commits an item (Enter on the highlighted row,
   * or a row's mouse-select). Receives the item and its index.
   */
  onSelect: (item: T, index: number) => void;
  /**
   * Optional: fired on Enter when there is no highlighted item (empty
   * list, or highlight === -1). Receives the raw typed value. Used by
   * the contributor field to "commit" a typed-but-unmatched handle.
   * Return value is ignored.
   */
  onSubmitNoMatch?: (raw: string) => void;
  /**
   * Optional: fired on Enter and takes PRECEDENCE over committing a
   * highlighted row. When provided and the typed value is non-empty,
   * Enter calls this with the trimmed value instead of selecting a
   * result — used by global search to jump to the full results page
   * regardless of what the live dropdown is showing. Arrow-key and
   * mouse selection of dropdown rows are unaffected.
   */
  onSubmit?: (raw: string) => void;

  /** Render one option row. See {@link ComboboxOptionRenderProps}. */
  renderOption: (props: ComboboxOptionRenderProps<T>) => React.ReactNode;
  /**
   * Optional empty-state node, rendered inside the listbox when there
   * are no items. The combobox decides *whether* the listbox renders
   * (open + has-content); the surface decides what "empty" looks like.
   */
  renderEmpty?: () => React.ReactNode;
  /**
   * Optional content rendered at the TOP of the listbox, before the
   * options: group headers, an error banner, a resolved-DID hint, etc.
   */
  renderListHeader?: () => React.ReactNode;

  /** Ref to the underlying <input>, forwarded to the caller. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /**
   * Props merged onto the composed <Input> (or bare input via
   * `renderInput`): placeholder, size, variant, leadingIcon,
   * trailingIcon, label, aria-label, etc. The combobox owns the ARIA
   * combobox attributes and the value/keyboard handlers — those are
   * spread AFTER these, so they win.
   */
  inputProps?: Partial<InputProps>;
  /**
   * Interactive trailing control (e.g. a clear button) forwarded to
   * the <Input>'s trailing slot. Ignored when `renderInput` is used.
   */
  trailingButton?: React.ReactNode;

  /**
   * Escape hatch: render a bare <input> instead of the shared <Input>.
   * Receives the fully-wired props (value, onChange, onKeyDown, ARIA,
   * ref) — spread them onto your own `<input className="…">`. Use this
   * when a surface needs flush chrome the <Input> wrapper can't give.
   */
  renderInput?: (
    props: React.InputHTMLAttributes<HTMLInputElement> & {
      ref: React.RefObject<HTMLInputElement | null>;
    },
  ) => React.ReactNode;

  /** Class on the outer wrapper. */
  className?: string;
  /** Class on the <ul role="listbox">. */
  listboxClassName?: string;
  /** When 'search', the wrapper gets `role="search"`. */
  role?: "search";

  /** Enable Home/End jump-to-edge keys. Default true. */
  enableHomeEnd?: boolean;
  /**
   * Auto-highlight the first row whenever the item set is non-empty, so
   * Enter commits a result even before the user arrows into the list.
   * Default `true` (the standard typeahead behaviour shared by the
   * search surfaces).
   *
   * Set `false` for surfaces whose Enter must not pick a row the user
   * never navigated to:
   *  - with `onSubmitNoMatch`, an un-highlighted Enter commits the typed
   *    value via that handler even when results are visible (e.g. the
   *    contributor field, where you may be entering a handle that merely
   *    *prefix-matches* existing rows);
   *  - without it, an un-highlighted Enter does nothing (e.g. handle
   *    search). Arrow / Home / End still highlight and commit normally.
   */
  autoHighlight?: boolean;
  /**
   * Escape behaviour:
   *  - 'two-stage' (default, WAI-ARIA): first Escape closes the
   *    listbox; a second Escape (already closed) clears the input,
   *    then blurs.
   *  - 'close-only': Escape only closes the listbox.
   */
  escapeStage?: ComboboxEscapeStage;

  /** Live-region copy. Omit to suppress sr-only announcements. */
  liveStatus?: ComboboxLiveStatus | null;
}

/**
 * Internal: derive the next highlight index for an arrow press,
 * wrapping at both ends. Returns -1 when the list is empty.
 */
function wrapHighlight(current: number, delta: 1 | -1, length: number): number {
  if (length === 0) return -1;
  if (delta === 1) return (current + 1) % length;
  return current <= 0 ? length - 1 : current - 1;
}

function Combobox<T>({
  value,
  onValueChange,
  items,
  getItemKey,
  isLoading = false,
  open,
  onOpenChange,
  onSelect,
  onSubmitNoMatch,
  onSubmit,
  renderOption,
  renderEmpty,
  renderListHeader,
  inputRef: inputRefProp,
  inputProps,
  trailingButton,
  renderInput,
  className = "",
  listboxClassName = "",
  role,
  enableHomeEnd = true,
  autoHighlight = true,
  escapeStage = "two-stage",
  liveStatus,
}: ComboboxProps<T>) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const optionIdPrefix = `${reactId}-option`;

  const [highlight, setHighlight] = React.useState(-1);

  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = inputRefProp ?? internalInputRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const count = items.length;

  // Reset the highlight whenever the item set changes: first row when
  // the list is non-empty (and auto-highlight is on), -1 otherwise.
  // Keying off `count` (not the array identity) keeps this stable when a
  // parent passes a fresh array each render with the same contents.
  useEffect(() => {
    setHighlight(count > 0 && autoHighlight ? 0 : -1);
  }, [count, autoHighlight]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current && !containerRef.current.contains(target)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onOpenChange]);

  // Keep the highlighted row visible during keyboard navigation.
  useEffect(() => {
    if (highlight < 0 || !listRef.current) return;
    const rows = listRef.current.querySelectorAll<HTMLElement>(
      "[data-combobox-option]",
    );
    rows[highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const optionIdFor = useCallback(
    (index: number) => `${optionIdPrefix}-${index}`,
    [optionIdPrefix],
  );

  const moveHighlight = useCallback(
    (delta: 1 | -1) => {
      onOpenChange(true);
      setHighlight((h) => wrapHighlight(h, delta, count));
    },
    [count, onOpenChange],
  );

  const commitHighlighted = useCallback(() => {
    // Enter commits in priority order:
    //  1. an explicitly highlighted row (arrow / Home / End, or the
    //     auto-highlighted first row);
    //  2. with `autoHighlight`, the first row as a fallback when items
    //     exist but nothing is highlighted yet — preserves the search
    //     surfaces' "Enter picks first result" behaviour;
    //  3. otherwise hand control to `onSubmitNoMatch` (typed-value
    //     commit). With `autoHighlight` off this is how the contributor
    //     field commits a typed handle even while results are visible;
    //     handle-search (no `onSubmitNoMatch`) simply does nothing.
    if (highlight >= 0) {
      const item = items[highlight];
      if (item !== undefined) onSelect(item, highlight);
      return;
    }
    if (autoHighlight && count > 0) {
      const item = items[0];
      if (item !== undefined) onSelect(item, 0);
      return;
    }
    onSubmitNoMatch?.(value);
  }, [autoHighlight, count, highlight, items, onSelect, onSubmitNoMatch, value]);

  const handleEscape = useCallback(() => {
    if (open) {
      onOpenChange(false);
      return;
    }
    if (escapeStage === "close-only") return;
    // two-stage: already closed → clear, else blur.
    if (value) {
      onValueChange("");
    } else {
      inputRef.current?.blur();
    }
  }, [open, escapeStage, value, onValueChange, onOpenChange, inputRef]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "ArrowDown":
          if (count === 0) return;
          e.preventDefault();
          moveHighlight(1);
          return;
        case "ArrowUp":
          if (count === 0) return;
          e.preventDefault();
          moveHighlight(-1);
          return;
        case "Enter": {
          // A surface-level submit handler (e.g. global search → explore)
          // takes precedence over row selection: Enter on a non-empty
          // query jumps to the full results page rather than committing
          // whatever row the live dropdown happens to be highlighting.
          if (onSubmit && value.trim().length > 0) {
            e.preventDefault();
            onSubmit(value.trim());
            return;
          }
          // Enter commits. Always preventDefault when there's anything
          // to commit (a row, or a no-match handler with a typed value)
          // so the surrounding form doesn't submit out from under us.
          // A row commits when one is highlighted, or — with
          // autoHighlight — when items exist and we fall back to row 0.
          const willCommitRow = highlight >= 0 || (autoHighlight && count > 0);
          const willSubmitNoMatch =
            !willCommitRow && !!onSubmitNoMatch && value.trim().length > 0;
          // Nothing to commit (e.g. handle-search with autoHighlight off
          // and no row navigated to): let Enter through untouched.
          if (!willCommitRow && !willSubmitNoMatch) return;
          e.preventDefault();
          commitHighlighted();
          return;
        }
        case "Escape":
          e.preventDefault();
          handleEscape();
          return;
        case "Home":
          if (!enableHomeEnd || count === 0) return;
          e.preventDefault();
          setHighlight(0);
          return;
        case "End":
          if (!enableHomeEnd || count === 0) return;
          e.preventDefault();
          setHighlight(count - 1);
          return;
        default:
          return;
      }
    },
    [
      autoHighlight,
      count,
      enableHomeEnd,
      highlight,
      moveHighlight,
      commitHighlighted,
      handleEscape,
      onSubmit,
      onSubmitNoMatch,
      value,
    ],
  );

  const activeDescendant =
    open && highlight >= 0 ? optionIdFor(highlight) : undefined;

  // The listbox renders only when open AND there's something to show:
  // options, an empty-state, or a header (error banner / resolved hint).
  const hasListContent =
    count > 0 || Boolean(renderEmpty) || Boolean(renderListHeader);
  const showListbox = open && hasListContent;

  // ARIA attributes shared by both the composed <Input> and the bare
  // escape-hatch input. The caller's `inputProps` are spread BEFORE
  // these in the <Input> path so these always win. Typed as a precise
  // literal (not the broad InputHTMLAttributes) so it stays assignable
  // to both InputProps and a bare <input>'s props.
  const ariaProps = {
    role: "combobox" as const,
    "aria-autocomplete": "list" as const,
    "aria-expanded": showListbox,
    "aria-controls": showListbox ? listboxId : undefined,
    "aria-activedescendant": activeDescendant,
    autoComplete: "off" as const,
    spellCheck: false,
  };

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(e.target.value);
    },
    [onValueChange],
  );

  const onFocus = useCallback(() => {
    if (count > 0) onOpenChange(true);
  }, [count, onOpenChange]);

  // Resolve the live-region message. Empty string → SR says nothing.
  let liveMessage = "";
  if (liveStatus) {
    if (isLoading) liveMessage = liveStatus.searching;
    else if (count > 0) liveMessage = liveStatus.results(count);
    else if (value.trim()) liveMessage = liveStatus.empty;
  }

  const inputElement = renderInput ? (
    // The ref object is handed to the consumer's render-prop purely so it can
    // attach it (e.g. ref={props.ref} on a bare <input>); it is never
    // dereferenced during render here.
    // eslint-disable-next-line react-hooks/refs
    renderInput({
      ref: inputRef,
      value,
      onChange,
      onKeyDown: handleKeyDown,
      onFocus,
      ...ariaProps,
    })
  ) : (
    <Input
      ref={inputRef}
      type="text"
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      trailingButton={trailingButton}
      {...inputProps}
      {...ariaProps}
    />
  );

  return (
    <div ref={containerRef} className={className} role={role}>
      {inputElement}

      {liveStatus ? (
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {liveMessage}
        </div>
      ) : null}

      {showListbox ? (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-busy={isLoading || undefined}
          className={listboxClassName}
        >
          {renderListHeader ? renderListHeader() : null}
          {count === 0 && renderEmpty ? renderEmpty() : null}
          {items.map((item, index) => {
            const optionId = optionIdFor(index);
            return (
              <React.Fragment key={getItemKey(item, index)}>
                {renderOption({
                  item,
                  index,
                  highlighted: index === highlight,
                  optionId,
                  onHover: () => setHighlight(index),
                  onSelect: (e: React.MouseEvent) => {
                    // mouseDown fires before the input blur — preventing
                    // default keeps the listbox open until selection runs.
                    e.preventDefault();
                    onSelect(item, index);
                  },
                })}
              </React.Fragment>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export default Combobox;
