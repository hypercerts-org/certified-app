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

const numberFormat = new Intl.NumberFormat("en");

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
  const hydrating = actor === undefined;

  const toggle = () => {
    if (hydrating || pending) return;
    if (actor === null) {
      router.push(`/sign-in?${new URLSearchParams({ returnTo: returnPath })}`);
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
  sync: (subject: string, next: LikeEntry) => void;
};

const LikeScopeContext = createContext<LikeScopeValue | null>(null);

/**
 * Batches like counts and viewer state for every `subjects` AT-URI rendered
 * inside a timeline or feed, issuing one `/api/likes` request per batch of new
 * subjects (including after Load more).
 */
export function LikeScope({ subjects, children }: { subjects: string[]; children: ReactNode }) {
  const [actor, setActor] = useState<string | null | undefined>(undefined);
  const [entries, setEntries] = useState<Record<string, LikeEntry>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  const subjectsKey = useMemo(
    () => [...new Set(subjects.filter(Boolean))].sort().join("\n"),
    [subjects],
  );

  useEffect(() => {
    const all = subjectsKey ? subjectsKey.split("\n") : [];
    const missing = all.filter((uri) => !fetchedRef.current.has(uri));
    if (missing.length === 0) return;

    const controller = new AbortController();
    let settled = false;
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
      });

    return () => {
      controller.abort();
      if (!settled) {
        for (const uri of missing) fetchedRef.current.delete(uri);
      }
    };
  }, [subjectsKey]);

  const sync = useCallback((subject: string, next: LikeEntry) => {
    setEntries((prev) => ({ ...prev, [subject]: next }));
  }, []);

  const value = useMemo(() => ({ actor, entries, sync }), [actor, entries, sync]);

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
    />
  );
}
