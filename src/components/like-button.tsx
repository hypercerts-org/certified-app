"use client";

// Like button + batched timeline scope (`LikeScope`) backed by
// `@hypercerts-org/sdk/social` (`likeRecord` / `unlikeRecord`) and
// `/api/likes` (`app.certified.feed.getReactionCounts` + `getActorReactions`).

import { Button } from "@hypercerts-org/ui-react";
import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import * as likeActions from "@/lib/hypercerts/like-actions";
import { signInHref } from "@/lib/validate";

const numberFormat = new Intl.NumberFormat("en");
const ACTING_AS_CHANGED_EVENT = "certified:acting-as-changed";

/** Notifies mounted `<LikeScope>` providers to re-fetch likes after `switchActingAs`. */
export function notifyActingAsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ACTING_AS_CHANGED_EVENT));
  }
}

export type LikeEntry = { count: number; likeUri: string | null };

const lost = (action: "like" | "unlike") =>
  ({
    ok: false,
    message:
      action === "like"
        ? "We couldn't confirm the like. Reload to check."
        : "We couldn't confirm removing the like. Reload to check.",
  }) as const;

/**
 * Interactive Like button for any AT Protocol record (`subject` AT-URI).
 *
 * - `variant="header"`: secondary `sm` button in Activity/Project page headers.
 * - `variant="post"`: compact quiet button in timeline/feed post footers.
 */
export function LikeButton({
  subject,
  path,
  actor,
  initialCount,
  initialLikeUri,
  variant = "header",
  onSync,
  loadFailed = false,
  onRetryLoad,
}: {
  subject: string;
  /** Return path if a signed-out visitor clicks Like. */
  path?: string;
  /** Acting account DID, `null` when signed out, or `undefined` while still hydrating. */
  actor: string | null | undefined;
  initialCount: number;
  initialLikeUri: string | null;
  variant?: "header" | "post";
  /** Optional callback to keep a parent `LikeScope` map in sync after toggle. */
  onSync?: (subject: string, next: LikeEntry) => void;
  /** True when batch hydration failed, so clicking retries instead of staying stuck disabled. */
  loadFailed?: boolean;
  onRetryLoad?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const returnPath = path ?? pathname ?? "/";

  const [state, setState] = useState<LikeEntry>({
    count: initialCount,
    likeUri: initialLikeUri,
  });
  const [pending, startTransition] = useTransition();

  // Sync when server/batch props arrive or update (unless a local toggle is in flight).
  useEffect(() => {
    setState({ count: initialCount, likeUri: initialLikeUri });
  }, [initialCount, initialLikeUri]);

  const liked = state.likeUri !== null;
  const hydrating = actor === undefined && !loadFailed;

  const toggle = () => {
    if (hydrating || pending) return;
    if (actor === undefined && loadFailed) {
      toast.error("Couldn't load likes right now. Retrying…");
      onRetryLoad?.();
      return;
    }
    if (actor === null || actor === undefined) {
      router.push(signInHref(returnPath));
      return;
    }

    const before = state;
    const nextLiked = !liked;
    const optimistic: LikeEntry = {
      count: Math.max(0, before.count + (nextLiked ? 1 : -1)),
      likeUri: nextLiked ? "pending" : null,
    };
    setState(optimistic);
    onSync?.(subject, optimistic);

    startTransition(async () => {
      const result = nextLiked
        ? await likeActions.likeRecord({ repo: actor, subject }).catch(() => lost("like"))
        : await likeActions
            .unlikeRecord({
              repo: actor,
              subject,
              uris: before.likeUri && before.likeUri !== "pending" ? [before.likeUri] : [],
            })
            .catch(() => lost("unlike"));

      if (!result.ok) {
        setState(before);
        onSync?.(subject, before);
        toast.error(result.message);
        return;
      }

      const settled: LikeEntry = {
        count: optimistic.count,
        likeUri: result.likeUri,
      };
      setState(settled);
      onSync?.(subject, settled);
    });
  };

  const countText = state.count > 0 ? numberFormat.format(state.count) : null;
  const label = liked ? "Unlike" : "Like";

  if (variant === "post") {
    return (
      <button
        type="button"
        className="post-like-button"
        aria-pressed={liked}
        aria-label={countText ? `${label} (${countText})` : label}
        disabled={pending || hydrating}
        onClick={toggle}
      >
        <Heart
          size={15}
          strokeWidth={1.75}
          aria-hidden
          className={liked ? "like-heart like-heart--on" : "like-heart"}
        />
        <span>{countText ?? "Like"}</span>
      </button>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      pressed={liked}
      disabled={pending || hydrating}
      onClick={toggle}
      aria-label={countText ? `${label} (${countText})` : label}
    >
      <Heart size={16} aria-hidden className={liked ? "like-heart like-heart--on" : "like-heart"} />
      <span>{liked ? "Liked" : "Like"}</span>
      {countText && <span className="like-count">{countText}</span>}
    </Button>
  );
}

type LikeScopeValue = {
  /** `undefined` until `/api/likes` resolves, then DID or `null`. */
  actor: string | null | undefined;
  entries: Record<string, LikeEntry>;
  loadFailed: boolean;
  retry: () => void;
  sync: (subject: string, next: LikeEntry) => void;
};

const LikeScopeContext = createContext<LikeScopeValue | null>(null);

/**
 * Batches like counts and viewer state for every `subjects` AT-URI rendered
 * inside a timeline or feed, issuing one `/api/likes` request per batch of new
 * subjects (including after Load more). Resets automatically when the user
 * switches "Act as" so likes always write as the active account.
 */
export function LikeScope({ subjects, children }: { subjects: string[]; children: ReactNode }) {
  const [actor, setActor] = useState<string | null | undefined>(undefined);
  const [entries, setEntries] = useState<Record<string, LikeEntry>>({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const fetchedRef = useRef<Set<string>>(new Set());

  const resetScope = useCallback(() => {
    fetchedRef.current.clear();
    setActor(undefined);
    setEntries({});
    setLoadFailed(false);
    setEpoch((n) => n + 1);
  }, []);

  useEffect(() => {
    window.addEventListener(ACTING_AS_CHANGED_EVENT, resetScope);
    return () => window.removeEventListener(ACTING_AS_CHANGED_EVENT, resetScope);
  }, [resetScope]);

  const subjectsKey = useMemo(
    () => [...new Set(subjects.filter(Boolean))].sort().join("\n"),
    [subjects],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `epoch` intentionally triggers re-fetch on account switch or manual retry
  useEffect(() => {
    const all = subjectsKey ? subjectsKey.split("\n") : [];
    const missing = all.filter((uri) => !fetchedRef.current.has(uri));
    if (missing.length === 0) return;

    const controller = new AbortController();
    let settled = false;
    setLoadFailed(false);
    for (const uri of missing) fetchedRef.current.add(uri);

    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += 50) {
      batches.push(missing.slice(i, i + 50));
    }

    void Promise.all(
      batches.map(async (batch) => {
        const params = new URLSearchParams();
        for (const uri of batch) params.append("subjects", uri);
        const res = await fetch(`/api/likes?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Likes request failed (${res.status})`);
        return (await res.json()) as {
          actor: string | null;
          likes: Record<string, LikeEntry>;
        };
      }),
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        settled = true;
        let nextActor: string | null | undefined;
        const merged: Record<string, LikeEntry> = {};
        for (const res of results) {
          nextActor = res.actor;
          Object.assign(merged, res.likes);
        }
        if (nextActor !== undefined) setActor(nextActor);
        if (Object.keys(merged).length > 0) {
          setEntries((prev) => ({ ...merged, ...prev }));
        }
      })
      .catch(() => {
        // Release URIs so Strict Mode remount or a retry can re-fetch cleanly.
        for (const uri of missing) fetchedRef.current.delete(uri);
        if (!controller.signal.aborted) setLoadFailed(true);
      });

    return () => {
      controller.abort();
      if (!settled) {
        for (const uri of missing) fetchedRef.current.delete(uri);
      }
    };
  }, [subjectsKey, epoch]);

  const sync = useCallback((subject: string, next: LikeEntry) => {
    setEntries((prev) => ({ ...prev, [subject]: next }));
  }, []);

  const retry = useCallback(() => {
    setLoadFailed(false);
    setEpoch((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ actor, entries, loadFailed, retry, sync }),
    [actor, entries, loadFailed, retry, sync],
  );

  return <LikeScopeContext value={value}>{children}</LikeScopeContext>;
}

/** Compact Like button inside a `<LikeScope>` timeline/feed post. */
export function PostLikeButton({ subject }: { subject: string }) {
  const ctx = useContext(LikeScopeContext);
  const entry = ctx?.entries[subject];
  return (
    <LikeButton
      subject={subject}
      actor={ctx ? ctx.actor : null}
      initialCount={entry?.count ?? 0}
      initialLikeUri={entry?.likeUri ?? null}
      variant="post"
      onSync={ctx?.sync}
      loadFailed={ctx?.loadFailed ?? false}
      onRetryLoad={ctx?.retry}
    />
  );
}
