"use client";

// Like button + batched timeline scope (`LikeScope`) backed by
// `@hypercerts-org/sdk/social` (`likeRecord` / `unlikeRecord`),
// `/api/likes`, and TanStack Query (`likesBatchQuery`).

import { Button } from "@hypercerts-org/ui-react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import * as likeActions from "@/lib/hypercerts/like-actions";
import {
  type LikeEntry,
  type LikesBatchResponse,
  likesBatchQuery,
  queryKeys,
} from "@/lib/query-keys";
import { signInHref } from "@/lib/validate";

export type { LikeEntry };

const numberFormat = new Intl.NumberFormat("en");
const BATCH_SIZE = 50;

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
  /** Optional callback to keep a parent `LikeScope` cache in sync after toggle. */
  onSync?: (subject: string, next: LikeEntry) => void;
  /** True when batch hydration failed, so clicking retries instead of staying stuck disabled. */
  loadFailed?: boolean;
  onRetryLoad?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const returnPath = path ?? pathname ?? "/";

  const [committed, setCommitted] = useState<LikeEntry>({
    count: initialCount,
    likeUri: initialLikeUri,
  });
  // Sync committed state when server/batch props arrive or refresh.
  useEffect(() => {
    setCommitted({ count: initialCount, likeUri: initialLikeUri });
  }, [initialCount, initialLikeUri]);

  const [optimistic, setOptimistic] = useOptimistic(committed);
  const [pending, startTransition] = useTransition();

  const liked = optimistic.likeUri !== null;
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

    const before = committed;
    const nextLiked = before.likeUri === null;
    const nextOptimistic: LikeEntry = {
      count: Math.max(0, before.count + (nextLiked ? 1 : -1)),
      likeUri: nextLiked ? "pending" : null,
    };

    startTransition(async () => {
      setOptimistic(nextOptimistic);
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
        toast.error(result.message);
        return;
      }

      const settled: LikeEntry = {
        count: nextOptimistic.count,
        likeUri: result.likeUri,
      };
      setCommitted(settled);
      onSync?.(subject, settled);
    });
  };

  const countText = optimistic.count > 0 ? numberFormat.format(optimistic.count) : null;
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

/** Groups unseen subject AT-URIs into sorted batches of 50 so prior batches stay cache hits. */
function chunkNewSubjects(subjects: string[], seen: ReadonlySet<string>): string[][] {
  const added: string[] = [];
  const local = new Set(seen);
  for (const uri of subjects) {
    if (!uri || local.has(uri)) continue;
    local.add(uri);
    added.push(uri);
  }
  if (added.length === 0) return [];
  added.sort();
  const batches: string[][] = [];
  for (let i = 0; i < added.length; i += BATCH_SIZE) {
    batches.push(added.slice(i, i + BATCH_SIZE));
  }
  return batches;
}

/**
 * Batches like counts and viewer state for every `subjects` AT-URI rendered
 * inside a timeline or feed through TanStack Query (`likesBatchQuery`). Each
 * new page of subjects appends immutable batches so prior pages stay cached;
 * switching "Act as" resets `queryKeys.likesAll` so likes always write as the
 * active account.
 */
export function LikeScope({ subjects, children }: { subjects: string[]; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [batches, setBatches] = useState<string[][]>(() => chunkNewSubjects(subjects, new Set()));

  const seen = useMemo(() => new Set(batches.flat()), [batches]);
  const extra = useMemo(() => chunkNewSubjects(subjects, seen), [subjects, seen]);
  if (extra.length > 0) {
    setBatches((prev) => [...prev, ...extra]);
  }

  const results = useQueries({
    queries: batches.map((batch) => likesBatchQuery(batch)),
  });

  const actor = useMemo(() => {
    if (batches.length === 0) return null;
    for (const res of results) {
      if (res.data !== undefined) return res.data.actor;
    }
    return undefined;
  }, [batches.length, results]);

  const entries = useMemo(() => {
    const merged: Record<string, LikeEntry> = {};
    for (const res of results) {
      if (res.data) Object.assign(merged, res.data.likes);
    }
    return merged;
  }, [results]);

  const loadFailed = results.some((res) => res.isError && res.data === undefined);

  const sync = useCallback(
    (subject: string, next: LikeEntry) => {
      queryClient.setQueriesData<LikesBatchResponse>(
        { queryKey: queryKeys.likesAll },
        (previous) => {
          if (!previous || !(subject in previous.likes)) return previous;
          return {
            ...previous,
            likes: { ...previous.likes, [subject]: next },
          };
        },
      );
    },
    [queryClient],
  );

  const retry = useCallback(() => {
    void queryClient.refetchQueries({ queryKey: queryKeys.likesAll });
  }, [queryClient]);

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
