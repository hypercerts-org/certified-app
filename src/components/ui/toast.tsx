"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle, AlertCircle } from "lucide-react";

/*
 * Shared toast system.
 *
 * API (wired into the app shell during migration):
 *
 *   // 1. Mount <ToastProvider> high in the tree (app shell), wrapping the app.
 *   //    It renders its own portal-backed <Toaster> region, so no separate
 *   //    placement is required.
 *   <ToastProvider>
 *     <App />
 *   </ToastProvider>
 *
 *   // 2. Anywhere below it, call useToast():
 *   const { toast, dismiss } = useToast();
 *
 *   const id = toast({
 *     title: "Response hidden",          // required
 *     description: "From your feed.",     // optional secondary line
 *     variant: "default",                 // "default" | "success" | "error"
 *     duration: 6000,                     // ms; 0 / Infinity = sticky (no auto-dismiss)
 *     action: {                           // optional action button (e.g. Undo)
 *       label: "Undo",
 *       onClick: () => restore(),
 *     },
 *   });
 *
 *   dismiss(id);  // imperative dismiss (e.g. after the action resolves)
 *
 * Announcement: the region is an aria-live stack. "error" toasts announce
 * assertively (role="alert"); everything else announces politely
 * (role="status"). Auto-dismiss pauses on hover/focus and resumes on leave.
 */

export type ToastVariant = "default" | "success" | "error";

export interface ToastAction {
  label: string;
  /** Invoked on click. The toast is dismissed immediately afterwards. */
  onClick: () => void;
}

export interface ToastOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  /**
   * Auto-dismiss delay in ms. Defaults to 6000. Pass 0 or Infinity to make the
   * toast sticky (dismissable only by the user or an imperative dismiss()).
   */
  duration?: number;
  action?: ToastAction;
}

interface ToastRecord extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  /** Enqueue a toast. Returns its id so callers can dismiss() it imperatively. */
  toast: (options: ToastOptions) => string;
  /** Dismiss a specific toast by id. */
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 6000;

/**
 * Access the toast API. Must be called from inside a <ToastProvider>.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  // Monotonic counter so ids are unique even within the same tick.
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id = `toast-${counter.current++}`;
    setToasts((prev) => [...prev, { ...options, id }]);
    return id;
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toast, dismiss }),
    [toast, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * The aria-live stack. Rendered into a portal by <ToastProvider>; not intended
 * to be mounted directly. Split out so the announcement region exists in the
 * DOM (empty) before any toast arrives — required for reliable SR announcement.
 */
function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  // SSR portal guard: stay null until mounted on the client so the
  // document.body portal target exists and server/client markup match.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div
      // Bottom-right stack on desktop; full-width pinned to the bottom on
      // narrow viewports so it clears the bottom-nav comfortably.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-feedback)] flex flex-col items-center gap-2 p-4 max-[799px]:items-stretch min-[800px]:inset-x-auto min-[800px]:bottom-4 min-[800px]:right-4 min-[800px]:items-end"
    >
      {/* Enter keyframe lives with the component (toast.tsx is the only file
          this step owns; no global stylesheet edit). Each item carries
          motion-reduce:animate-none, which compiles to a
          prefers-reduced-motion media query, so the animation is disabled for
          users who ask for reduced motion. */}
      <style>{TOAST_KEYFRAMES}</style>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}

const TOAST_KEYFRAMES = `
@keyframes toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

const variantChrome: Record<ToastVariant, string> = {
  default:
    "bg-[var(--bg-elevated)] text-[var(--fg-primary)] border-[var(--border-default)]",
  // Soft success tint; border stays neutral (no success-border token exists).
  success:
    "bg-[var(--color-success-bg)] text-[var(--fg-primary)] border-[var(--border-default)]",
  // Subtle error tint that flips in dark mode via the error-surface tokens.
  error:
    "bg-[var(--color-error-bg)] text-[var(--fg-primary)] border-[var(--color-error-border)]",
};

const variantIcon: Record<ToastVariant, React.ReactNode> = {
  default: null,
  success: (
    <CheckCircle
      className="h-5 w-5 shrink-0 text-[var(--color-success-text)]"
      aria-hidden="true"
    />
  ),
  error: (
    <AlertCircle
      className="h-5 w-5 shrink-0 text-[var(--color-error)]"
      aria-hidden="true"
    />
  ),
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
}) {
  const {
    id,
    title,
    description,
    variant = "default",
    duration = DEFAULT_DURATION,
    action,
  } = toast;

  const titleId = useId();
  const descId = useId();

  // A duration of 0 / Infinity (or non-finite) makes the toast sticky.
  const autoDismiss = Number.isFinite(duration) && duration > 0;

  // Pause-on-hover/focus: track remaining time and restart the timer on resume
  // so the visible dwell isn't cut short by an interaction.
  const remainingRef = useRef(duration);
  const startedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (ms: number) => {
      clearTimer();
      startedRef.current = Date.now();
      timerRef.current = setTimeout(() => onDismiss(id), ms);
    },
    [clearTimer, id, onDismiss]
  );

  useEffect(() => {
    if (!autoDismiss) return;
    remainingRef.current = duration;
    startTimer(duration);
    return clearTimer;
  }, [autoDismiss, duration, startTimer, clearTimer]);

  const pause = useCallback(() => {
    if (!autoDismiss || timerRef.current === null) return;
    remainingRef.current = Math.max(
      0,
      remainingRef.current - (Date.now() - startedRef.current)
    );
    clearTimer();
  }, [autoDismiss, clearTimer]);

  const resume = useCallback(() => {
    if (!autoDismiss || timerRef.current !== null) return;
    startTimer(remainingRef.current);
  }, [autoDismiss, startTimer]);

  const handleAction = useCallback(() => {
    action?.onClick();
    onDismiss(id);
  }, [action, id, onDismiss]);

  return (
    <div
      // Errors interrupt (assertive); everything else is polite. The matching
      // role pairs with aria-live so SRs read the whole toast as a unit.
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded border px-4 py-3 shadow-[var(--shadow-md)] min-[800px]:w-auto min-[800px]:min-w-[20rem] min-[800px]:max-w-[26rem] animate-[toast-in_150ms_ease-out] motion-reduce:animate-none ${variantChrome[variant]}`}
    >
      {variantIcon[variant]}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p id={titleId} className="text-sm font-medium">
          {title}
        </p>
        {description && (
          <p id={descId} className="text-xs text-[var(--fg-muted)]">
            {description}
          </p>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={handleAction}
          className="shrink-0 self-center rounded px-2 py-1 text-xs font-semibold text-[var(--fg-primary)] underline-offset-2 transition-colors duration-150 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 motion-reduce:transition-none"
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="-mr-1 shrink-0 self-start rounded p-1 text-[var(--fg-muted)] transition-colors duration-150 hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 motion-reduce:transition-none"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default ToastProvider;
