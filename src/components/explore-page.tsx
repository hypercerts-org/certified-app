// Explore's pages. All: a section per type (Featured first, unless
// searching), five rows each and a link to the rest. Activities, Projects,
// Accounts: one type in full, with the toolbar's controls.

import { Heading, Text } from "@hypercerts-org/ui-react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { type ExploreItem, ExploreItems, ExploreRowsSkeleton } from "@/components/explore-items";
import { ExploreList } from "@/components/explore-list";
import { ExploreToolbar, ExploreToolbarSkeleton } from "@/components/explore-toolbar";
import { explorePage } from "@/lib/explore";
import {
  type ExploreKind,
  type ExploreState,
  exploreFrom,
  exploreHref,
  exploreSearch,
} from "@/lib/explore-state";
import {
  exploreAccounts,
  exploreActivities,
  exploreFeatured,
  exploreProjects,
} from "@/lib/hypercerts/queries";
import type { Page } from "@/lib/hypercerts/views";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const NOUN: Record<ExploreKind, string> = {
  activities: "activities",
  projects: "projects",
  accounts: "accounts",
};

const SECTION_ROWS = 5;

function emptyText(kind: ExploreKind, state: ExploreState) {
  if (state.query) return `No ${NOUN[kind]} match "${state.query}"`;
  if (state.featured) return `No featured ${NOUN[kind]}`;
  return `No ${NOUN[kind]} yet`;
}

// All

function Section({
  title,
  description,
  more,
  moreHref,
  children,
}: {
  title: string;
  description?: string;
  more: string;
  moreHref: string;
  children: React.ReactNode;
}) {
  return (
    <section className="explore-section" aria-label={title}>
      <div className="explore-section-head">
        <div className="section-heading">
          <Heading level={2} size="heading">
            {title}
          </Heading>
          {description && <Text tone="muted">{description}</Text>}
        </div>
        <Link prefetch href={moreHref} className="explore-more">
          {more}
          <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      {children}
    </section>
  );
}

async function SectionRows({
  kind,
  state,
  load,
}: {
  kind: ExploreKind;
  state: ExploreState;
  load: () => Promise<Page<ExploreItem>>;
}) {
  const { items } = await load();
  if (items.length === 0) {
    return (
      <Text size="body-sm" tone="muted">
        {emptyText(kind, state)}.
      </Text>
    );
  }
  return <ExploreItems kind={kind} items={items.slice(0, SECTION_ROWS)} />;
}

function TypeSection({ kind, state }: { kind: ExploreKind; state: ExploreState }) {
  const options = { query: state.query || undefined, sort: "newest", limit: SECTION_ROWS } as const;
  const load =
    kind === "activities"
      ? () => exploreActivities(options)
      : kind === "projects"
        ? () => exploreProjects(options)
        : () => exploreAccounts({ ...options, type: "all" });
  const title = NOUN[kind][0].toUpperCase() + NOUN[kind].slice(1);
  return (
    <Section
      title={title}
      more={`All ${NOUN[kind]}`}
      moreHref={exploreHref(kind, exploreSearch(state))}
    >
      <Suspense fallback={<ExploreRowsSkeleton kind={kind} rows={SECTION_ROWS} />}>
        <SectionRows kind={kind} state={state} load={load} />
      </Suspense>
    </Section>
  );
}

async function AllSections({ searchParams }: { searchParams: SearchParams }) {
  const state = exploreFrom(await searchParams);
  return (
    <>
      {!state.query && (
        <Section
          title="Featured"
          description="Activities from projects in Ma Earth Funding Round 3."
          more="All featured"
          moreHref={exploreHref("activities", "?list=featured")}
        >
          <Suspense fallback={<ExploreRowsSkeleton kind="activities" rows={SECTION_ROWS} />}>
            <SectionRows
              kind="activities"
              state={{ ...state, featured: true }}
              load={() => exploreFeatured("activities", 0, SECTION_ROWS)}
            />
          </Suspense>
        </Section>
      )}
      <TypeSection kind="activities" state={state} />
      <TypeSection kind="projects" state={state} />
      <TypeSection kind="accounts" state={state} />
    </>
  );
}

/** All's sections on their way: each a heading and its rows. */
function AllSectionsSkeleton() {
  return (
    <>
      {(["Featured", "Activities", "Projects", "Accounts"] as const).map((title) => (
        <section key={title} className="explore-section" aria-hidden>
          <div className="explore-section-head">
            <Heading level={2} size="heading">
              {title}
            </Heading>
          </div>
          <ExploreRowsSkeleton
            kind={title === "Accounts" ? "accounts" : "activities"}
            rows={SECTION_ROWS}
          />
        </section>
      ))}
    </>
  );
}

export function ExploreAll({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <Suspense fallback={<ExploreToolbarSkeleton kind="all" />}>
        <ExploreToolbar kind="all" />
      </Suspense>
      <Suspense fallback={<AllSectionsSkeleton />}>
        <AllSections searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// One type

/** Above Featured: what it is, and the way back to everything. */
function FeaturedNote({ kind, state }: { kind: ExploreKind; state: ExploreState }) {
  return (
    <div className="explore-note">
      <Text>Showing Ma Earth Funding Round 3.</Text>
      <Link
        href={exploreHref(kind, exploreSearch(state, { featured: false }))}
        className="explore-more"
      >
        Show everything
      </Link>
    </div>
  );
}

async function KindResults({
  kind,
  searchParams,
}: {
  kind: ExploreKind;
  searchParams: SearchParams;
}) {
  const state = exploreFrom(await searchParams);
  const featured = state.featured && !state.query;
  const initial = (await explorePage(kind, state)) as Page<ExploreItem>;
  return (
    <>
      {featured && <FeaturedNote kind={kind} state={state} />}
      <ExploreList
        // A new list for new results: each keeps its own pages.
        key={exploreSearch(state, { view: "list" })}
        kind={kind}
        state={{ ...state, featured }}
        initial={initial}
        empty={emptyText(kind, state)}
      />
    </>
  );
}

export function ExploreKindPage({
  kind,
  searchParams,
}: {
  kind: ExploreKind;
  searchParams: SearchParams;
}) {
  return (
    <>
      <Suspense fallback={<ExploreToolbarSkeleton kind={kind} />}>
        <ExploreToolbar kind={kind} />
      </Suspense>
      <Suspense fallback={<ExploreRowsSkeleton kind={kind} />}>
        <KindResults kind={kind} searchParams={searchParams} />
      </Suspense>
    </>
  );
}
