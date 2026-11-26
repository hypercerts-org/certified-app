"use client";

import {
  Button,
  Card,
  Checkbox,
  ErrorMessage,
  Eyebrow,
  LoadMoreSentinel,
  ResponsiveDialog,
  Text,
} from "@hypercerts-org/ui-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AlertCircle, Filter, Inbox, Newspaper, RotateCcw, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActorAvatar, ActorLink, ActorStack } from "@/components/actor";
import { Empty } from "@/components/empty";
import { LikeScope, PostLikeButton } from "@/components/like-button";
import { PageHeader } from "@/components/page-title";
import {
  Media,
  Name,
  Names,
  PageLink,
  Post,
  ProfileFeedSkeleton,
  RecordText,
} from "@/components/profile-feed";
import {
  DEFAULT_ORG_QUALITY,
  FEED_KIND_GROUPS,
  type FeedEventKind,
  type FeedKindGroupId,
  type GroupedFeedItem,
  groupNetworkFeed,
  type NetworkFeedEntry,
  ORG_QUALITY_LABELS,
  ORG_QUALITY_TIERS,
  type OrgQualityTier,
} from "@/lib/feed-grouping";
import { type ActorCard, nameOf, type Page } from "@/lib/hypercerts/views";
import { groupSettingsHref } from "@/lib/routes";

const FEED_DESCRIPTION =
  "New activities, projects, updates and endorsements from accounts you follow and your trusted endorsers.";
const FEED_DESCRIPTION_GROUP =
  "New activities, projects, updates and endorsements from accounts this group follows and this group's trusted endorsers.";

/** Minimum visible grouped rows before auto-loading another page (absorbs endorsement bursts). */
const MIN_VISIBLE_ITEMS = 8;
const MAX_AUTO_LOADS = 6;

const DEFAULT_ORG_SET = new Set<OrgQualityTier>(DEFAULT_ORG_QUALITY.allowed);

function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function setDiffCount<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  let count = 0;
  for (const item of a) if (!b.has(item)) count++;
  for (const item of b) if (!a.has(item)) count++;
  return count;
}

function resolveKinds(selectedGroups: ReadonlySet<FeedKindGroupId>): FeedEventKind[] {
  if (selectedGroups.size === 0) return [];
  const kinds = new Set<FeedEventKind>();
  for (const group of FEED_KIND_GROUPS) {
    if (selectedGroups.has(group.id)) {
      for (const kind of group.kinds) kinds.add(kind);
    }
  }
  return [...kinds];
}

function NetworkFeedPost({ item }: { item: GroupedFeedItem }) {
  if (item.type === "endorsementGroup") {
    const shown = item.subjects.slice(0, 2);
    return (
      <Post
        who={item.actor}
        date={item.date}
        line={
          <>
            <Name actor={item.actor} /> endorsed{" "}
            <Names
              items={shown.map((subject) => <Name key={subject.did} actor={subject} />)}
              count={item.subjects.length}
            />
          </>
        }
        body={<ActorStack actors={item.subjects} total={item.subjects.length} />}
      />
    );
  }

  const { entry } = item;
  switch (entry.kind) {
    case "cert.create":
      return (
        <Post
          who={entry.actor}
          date={entry.date}
          line={
            <>
              <Name actor={entry.actor} /> published an activity
            </>
          }
          body={
            <RecordText
              href={entry.href}
              title={entry.title}
              meta={entry.meta}
              text={entry.summary}
            />
          }
          media={<Media href={entry.href} src={entry.imageUrl} />}
          actions={<PostLikeButton subject={entry.uri} />}
        />
      );

    case "collection.create":
    case "project.created_with_cert":
      return (
        <Post
          who={entry.actor}
          date={entry.date}
          line={
            <>
              <Name actor={entry.actor} />{" "}
              {entry.kind === "project.created_with_cert"
                ? "started a project with an activity"
                : "started a project"}
            </>
          }
          body={
            <RecordText
              href={entry.href}
              title={entry.title}
              meta={entry.meta}
              text={entry.summary}
            />
          }
          media={<Media href={entry.href} src={entry.imageUrl} />}
          actions={<PostLikeButton subject={entry.uri} />}
        />
      );

    case "update.create": {
      const targetHref = entry.target?.href ?? null;
      return (
        <Post
          who={entry.actor}
          date={entry.date}
          line={
            <>
              <Name actor={entry.actor} /> posted an update
              {entry.target && (
                <>
                  {" on "}
                  <PageLink link={entry.target} />
                </>
              )}
            </>
          }
          body={
            entry.title || entry.summary ? (
              targetHref && entry.title ? (
                <RecordText
                  href={targetHref}
                  title={entry.title}
                  meta={null}
                  text={entry.summary}
                />
              ) : (
                <div className="post-record">
                  {entry.title && (
                    <Text tone="ink" className="post-title" dir="auto">
                      {entry.title}
                    </Text>
                  )}
                  {entry.summary && (
                    <Text className="clamp" dir="auto">
                      {entry.summary}
                    </Text>
                  )}
                </div>
              )
            ) : undefined
          }
          media={targetHref ? <Media href={targetHref} src={entry.imageUrl} /> : undefined}
          actions={<PostLikeButton subject={entry.uri} />}
        />
      );
    }

    case "evaluation.create":
      return (
        <Post
          who={entry.actor}
          date={entry.date}
          line={
            <>
              <Name actor={entry.actor} /> evaluated{" "}
              {entry.target ? <PageLink link={entry.target} /> : "a record"}
            </>
          }
          body={
            entry.summary ? (
              <blockquote className="post-note" dir="auto">
                {entry.summary}
              </blockquote>
            ) : undefined
          }
          actions={<PostLikeButton subject={entry.uri} />}
        />
      );

    case "measurement.create":
      return (
        <Post
          who={entry.actor}
          date={entry.date}
          line={
            <>
              <Name actor={entry.actor} /> recorded a measurement
              {entry.target && (
                <>
                  {" on "}
                  <PageLink link={entry.target} />
                </>
              )}
            </>
          }
          body={
            entry.metric ? (
              <Text size="body-sm" tone="muted" dir="auto">
                {entry.metric}
              </Text>
            ) : undefined
          }
          actions={<PostLikeButton subject={entry.uri} />}
        />
      );

    case "endorsement.award":
      return (
        <Post
          who={entry.actor}
          date={entry.date}
          line={
            <>
              <Name actor={entry.actor} /> endorsed <Name actor={entry.subject} />
            </>
          }
        />
      );

    case "unknown":
      return (
        <Post
          who={entry.actor}
          date={entry.date}
          line={
            <>
              <Name actor={entry.actor} /> published a record
            </>
          }
        />
      );
  }
}

function FilterPanel({
  evaluators,
  selectedEvaluators,
  onToggleEvaluator,
  onSelectAllEvaluators,
  onClearEvaluators,
  orgTiers,
  onToggleOrgTier,
  includeUnrated,
  onToggleUnrated,
  isDefault,
  onReset,
  showReset,
}: {
  evaluators: readonly ActorCard[];
  selectedEvaluators: ReadonlySet<string>;
  onToggleEvaluator: (did: string) => void;
  onSelectAllEvaluators: () => void;
  onClearEvaluators: () => void;
  orgTiers: ReadonlySet<OrgQualityTier>;
  onToggleOrgTier: (tier: OrgQualityTier) => void;
  includeUnrated: boolean;
  onToggleUnrated: () => void;
  isDefault: boolean;
  onReset: () => void;
  showReset: boolean;
}) {
  return (
    <div className="feed-filters">
      {evaluators.length > 0 && (
        <section className="feed-filter-group">
          <div className="feed-filter-head">
            <Eyebrow as="p">Trusted endorsers</Eyebrow>
            <div className="feed-filter-links">
              {selectedEvaluators.size < evaluators.length ? (
                <button type="button" className="feed-filter-link" onClick={onSelectAllEvaluators}>
                  All
                </button>
              ) : (
                <button type="button" className="feed-filter-link" onClick={onClearEvaluators}>
                  None
                </button>
              )}
            </div>
          </div>
          <Text size="body-sm" tone="muted">
            Include accounts endorsed by these organizations.
          </Text>
          <ul className="feed-filter-list">
            {evaluators.map((evaluator) => (
              <li key={evaluator.did} className="feed-evaluator-row">
                <Checkbox
                  checked={selectedEvaluators.has(evaluator.did)}
                  onChange={() => onToggleEvaluator(evaluator.did)}
                  label={
                    <span className="feed-evaluator-label">
                      <ActorAvatar actor={evaluator} size="sm" />
                      <span className="feed-evaluator-text">
                        <span className="ellipsis">{nameOf(evaluator)}</span>
                        {evaluator.handle && nameOf(evaluator) !== `@${evaluator.handle}` && (
                          <span className="feed-evaluator-handle ellipsis">
                            @{evaluator.handle}
                          </span>
                        )}
                      </span>
                    </span>
                  }
                />
                <ActorLink actor={evaluator} avatar={false} className="visually-hidden" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="feed-filter-group">
        <Eyebrow as="p">Organization quality</Eyebrow>
        <Text size="body-sm" tone="muted">
          Filter organizations by their quality label.
        </Text>
        <ul className="feed-filter-list">
          {ORG_QUALITY_TIERS.map((tier) => (
            <li key={tier}>
              <Checkbox
                checked={orgTiers.has(tier)}
                onChange={() => onToggleOrgTier(tier)}
                label={ORG_QUALITY_LABELS[tier]}
              />
            </li>
          ))}
          <li>
            <Checkbox checked={includeUnrated} onChange={onToggleUnrated} label="Not labeled yet" />
          </li>
        </ul>
      </section>

      {showReset && !isDefault && (
        <div className="feed-filter-reset">
          <Button variant="secondary" size="sm" onClick={onReset}>
            <RotateCcw size={14} aria-hidden />
            Reset filters
          </Button>
        </div>
      )}
    </div>
  );
}

export function NetworkFeed({
  viewerDid,
  asGroup,
  evaluators,
  initial,
  initialFailed,
}: {
  viewerDid: string;
  asGroup: boolean;
  evaluators: ActorCard[];
  initial: Page<NetworkFeedEntry> | null;
  initialFailed: boolean;
}) {
  const defaultEvaluatorSet = useMemo(() => new Set(evaluators.map((e) => e.did)), [evaluators]);
  const [selectedEvaluators, setSelectedEvaluators] = useState<Set<string>>(
    () => new Set(evaluators.map((e) => e.did)),
  );
  const [orgTiers, setOrgTiers] = useState<Set<OrgQualityTier>>(
    () => new Set(DEFAULT_ORG_QUALITY.allowed),
  );
  const [includeUnrated, setIncludeUnrated] = useState(DEFAULT_ORG_QUALITY.includeUnrated);
  const [kindGroups, setKindGroups] = useState<Set<FeedKindGroupId>>(() => new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);

  const isDefaultFilters =
    kindGroups.size === 0 &&
    includeUnrated === DEFAULT_ORG_QUALITY.includeUnrated &&
    setsEqual(orgTiers, DEFAULT_ORG_SET) &&
    setsEqual(selectedEvaluators, defaultEvaluatorSet);

  const changedCount =
    kindGroups.size +
    (includeUnrated === DEFAULT_ORG_QUALITY.includeUnrated ? 0 : 1) +
    setDiffCount(orgTiers, DEFAULT_ORG_SET) +
    setDiffCount(selectedEvaluators, defaultEvaluatorSet);

  const evaluatorParam = useMemo(
    () => [...selectedEvaluators].sort().join(",") || "none",
    [selectedEvaluators],
  );
  const orgQualityParam = useMemo(() => [...orgTiers].sort().join(",") || "none", [orgTiers]);
  const kindsParam = useMemo(() => resolveKinds(kindGroups).sort().join(","), [kindGroups]);

  const buildUrl = useCallback(
    (cursor?: string) => {
      const qs = new URLSearchParams();
      qs.set("evaluators", evaluatorParam);
      qs.set("orgQuality", orgQualityParam);
      qs.set("includeUnrated", includeUnrated ? "true" : "false");
      if (kindsParam) qs.set("kinds", kindsParam);
      if (cursor) qs.set("cursor", cursor);
      return `/api/feed?${qs.toString()}`;
    },
    [evaluatorParam, orgQualityParam, includeUnrated, kindsParam],
  );

  const query = useInfiniteQuery<Page<NetworkFeedEntry>, Error>({
    queryKey: [
      "network-feed",
      viewerDid,
      evaluatorParam,
      orgQualityParam,
      includeUnrated,
      kindsParam,
    ],
    queryFn: async ({ pageParam, signal }) => {
      const res = await fetch(buildUrl(pageParam as string | undefined), { signal });
      if (!res.ok) throw new Error(`Couldn't load the feed (${res.status}).`);
      return (await res.json()) as Page<NetworkFeedEntry>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    initialData:
      isDefaultFilters && initial && !initialFailed
        ? { pages: [initial], pageParams: [undefined] }
        : undefined,
    staleTime: 60_000,
    retry: 1,
  });

  const entries = useMemo(() => {
    const seen = new Set<string>();
    const out: NetworkFeedEntry[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const entry of page.items) {
        if (seen.has(entry.uri)) continue;
        seen.add(entry.uri);
        out.push(entry);
      }
    }
    return out;
  }, [query.data]);

  const grouped = useMemo(() => groupNetworkFeed(entries), [entries]);

  // Auto-load additional pages when endorsement bursts collapse a page into
  // too few visible cards, capped at MAX_AUTO_LOADS per filter combination.
  const autoLoadsRef = useRef({ key: "", count: 0 });
  const filterKey = `${viewerDid}|${evaluatorParam}|${orgQualityParam}|${includeUnrated}|${kindsParam}`;
  useEffect(() => {
    if (autoLoadsRef.current.key !== filterKey) {
      autoLoadsRef.current = { key: filterKey, count: 0 };
    }
    if (query.isPending || query.isFetchingNextPage || !query.hasNextPage) return;
    if (grouped.length >= MIN_VISIBLE_ITEMS) return;
    if (autoLoadsRef.current.count >= MAX_AUTO_LOADS) return;
    autoLoadsRef.current.count += 1;
    void query.fetchNextPage();
  }, [
    filterKey,
    grouped.length,
    query.isPending,
    query.isFetchingNextPage,
    query.hasNextPage,
    query.fetchNextPage,
  ]);

  const resetFilters = useCallback(() => {
    setSelectedEvaluators(new Set(evaluators.map((e) => e.did)));
    setOrgTiers(new Set(DEFAULT_ORG_QUALITY.allowed));
    setIncludeUnrated(DEFAULT_ORG_QUALITY.includeUnrated);
    setKindGroups(new Set());
  }, [evaluators]);

  const toggleEvaluator = useCallback((did: string) => {
    setSelectedEvaluators((prev) => {
      const next = new Set(prev);
      if (next.has(did)) next.delete(did);
      else next.add(did);
      return next;
    });
  }, []);

  const toggleOrgTier = useCallback((tier: OrgQualityTier) => {
    setOrgTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }, []);

  const toggleKindGroup = useCallback((id: FeedKindGroupId) => {
    setKindGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const socialGraphHref = asGroup
    ? `${groupSettingsHref(viewerDid)}/social-graph`
    : "/settings/social-graph";

  const filterPanelProps = {
    evaluators,
    selectedEvaluators,
    onToggleEvaluator: toggleEvaluator,
    onSelectAllEvaluators: () => setSelectedEvaluators(new Set(evaluators.map((e) => e.did))),
    onClearEvaluators: () => setSelectedEvaluators(new Set()),
    orgTiers,
    onToggleOrgTier: toggleOrgTier,
    includeUnrated,
    onToggleUnrated: () => setIncludeUnrated((prev) => !prev),
    isDefault: isDefaultFilters,
    onReset: resetFilters,
  };

  return (
    <div className="page feed-page">
      <PageHeader
        title="Feed"
        description={asGroup ? FEED_DESCRIPTION_GROUP : FEED_DESCRIPTION}
        actions={
          <Button
            variant="secondary"
            size="sm"
            className="feed-filters-trigger"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
          >
            <Filter size={15} aria-hidden />
            {changedCount > 0 ? `Filters · ${changedCount}` : "Filters"}
          </Button>
        }
      />

      <fieldset className="feed-kind-bar">
        <legend className="visually-hidden">Filter by content type</legend>
        <button
          type="button"
          className="feed-kind-chip"
          aria-pressed={kindGroups.size === 0}
          onClick={() => setKindGroups(new Set())}
        >
          All
        </button>
        {FEED_KIND_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            className="feed-kind-chip"
            aria-pressed={kindGroups.has(group.id)}
            onClick={() => toggleKindGroup(group.id)}
          >
            {group.label}
          </button>
        ))}
      </fieldset>

      <div className="feed-layout">
        <div className="feed-main">
          {query.isPending ? (
            <ProfileFeedSkeleton />
          ) : query.isError && grouped.length === 0 ? (
            <Empty
              icon={AlertCircle}
              title="Couldn't load the feed"
              description="The feed service didn't respond. Try again in a moment."
              action={
                <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : grouped.length === 0 ? (
            !isDefaultFilters ? (
              <Empty
                icon={Inbox}
                title="Nothing matches your filters"
                description="No recent activities, projects, updates or endorsements pass the filters you set."
                action={
                  <Button variant="secondary" size="sm" onClick={resetFilters}>
                    Reset filters
                  </Button>
                }
              />
            ) : (
              <Empty
                icon={selectedEvaluators.size === 0 ? Users : Newspaper}
                title="Your feed is quiet"
                description="Follow accounts on Explore, or import your Bluesky follows in Settings, to see new work here."
                action={
                  <div className="feed-empty-actions">
                    <Button href="/explore/accounts" variant="primary" size="sm">
                      Find accounts
                    </Button>
                    <Button href={socialGraphHref} variant="secondary" size="sm">
                      Sync Bluesky follows
                    </Button>
                  </div>
                }
              />
            )
          ) : (
            <LikeScope
              subjects={grouped.flatMap((item) =>
                item.type === "entry" &&
                (item.entry.kind === "cert.create" ||
                  item.entry.kind === "collection.create" ||
                  item.entry.kind === "project.created_with_cert" ||
                  item.entry.kind === "update.create" ||
                  item.entry.kind === "evaluation.create" ||
                  item.entry.kind === "measurement.create")
                  ? [item.entry.uri]
                  : [],
              )}
            >
              <div className="stack">
                <ul className="post-feed">
                  {grouped.map((item) => (
                    <NetworkFeedPost key={item.key} item={item} />
                  ))}
                </ul>
                {query.isFetchNextPageError && (
                  <ErrorMessage live>Couldn&apos;t load more items. Try again.</ErrorMessage>
                )}
                <LoadMoreSentinel
                  onLoadMore={() => void query.fetchNextPage()}
                  loading={query.isFetchingNextPage}
                  hasMore={query.hasNextPage}
                  label="Load more"
                />
              </div>
            </LikeScope>
          )}
        </div>

        <aside className="feed-rail" aria-label="Feed filters">
          <Card variant="panel" className="feed-rail-card">
            <FilterPanel {...filterPanelProps} showReset />
          </Card>
        </aside>
      </div>

      <ResponsiveDialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Feed filters"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={resetFilters} disabled={isDefaultFilters}>
              Reset
            </Button>
            <Button variant="primary" onClick={() => setFiltersOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        <FilterPanel {...filterPanelProps} showReset={false} />
      </ResponsiveDialog>
    </div>
  );
}
