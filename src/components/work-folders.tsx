"use client";

// Projects and activities, after the staging redesign's Workspace section:
// each project a folder holding its activities, then "Without a project" for
// the account's activities that sit in none. One activity can sit in several
// projects, so it shows in each, with a chip naming the others.
//
// The rows arrive rendered by the server (work-page data, cached); this
// component only adds the search and remembers folders opened by hand.
// Folders are <details>, so they open and close without JavaScript. Creating,
// deleting and moving activities between projects come with the Hypercerts
// SDK's writes: until then New activity and New project are placeholders.

import { Button, EmptyState, SearchInput, Skeleton } from "@hypercerts-org/ui-react";
import { ArrowRight, ChevronRight, Folder, Plus, SquareCheckBig } from "lucide-react";
import { useState } from "react";
import { ComingSoonButton } from "@/components/coming-soon";
import { IntentLink } from "@/components/intent-link";

export type WorkRow = {
  uri: string;
  title: string;
  imageUrl: string | null;
  /** When the work happened, else when it was created. */
  meta: string;
  /** The other projects it sits in. */
  alsoIn: string[];
  /** Who published it, when not this account. */
  by: { name: string; href: string } | null;
};

export type WorkFolder = {
  key: string;
  title: string;
  /** The project's page; null for "Without a project". */
  href: string | null;
  imageUrl: string | null;
  meta: string;
  rows: WorkRow[];
};

/** Up to this many folders start open, as on staging. */
const OPEN_BY_DEFAULT = 3;

const matches = (text: string, query: string) => text.toLowerCase().includes(query);

function Toolbar({ query, onQuery }: { query: string; onQuery: (query: string) => void }) {
  return (
    <div className="work-toolbar">
      {/* Filters what's on the page: no debounce needed. */}
      <SearchInput
        className="work-search"
        label="Search projects and activities"
        placeholder="Search projects and activities"
        value={query}
        debounceMs={0}
        onChange={onQuery}
      />
      <NewButtons />
    </div>
  );
}

/** Placeholders until the Hypercerts SDK ships these writes. */
function NewButtons() {
  return (
    <div className="work-actions">
      <ComingSoonButton variant="primary">
        <Plus size={16} aria-hidden />
        New activity
      </ComingSoonButton>
      <ComingSoonButton>
        <Plus size={16} aria-hidden />
        New project
      </ComingSoonButton>
    </div>
  );
}

function Thumb({ src, project }: { src: string | null; project: boolean }) {
  return (
    <span className="overview-thumb">
      {src ? (
        // Indexed images come from many hosts: no next/image optimization.
        // biome-ignore lint/performance/noImgElement: arbitrary remote hosts
        <img src={src} alt="" width={32} height={32} loading="lazy" />
      ) : project ? (
        <Folder size={16} aria-hidden />
      ) : (
        <SquareCheckBig size={16} aria-hidden />
      )}
    </span>
  );
}

/** An activity. Activities have no page of their own yet, so it isn't a link. */
function Row({ row }: { row: WorkRow }) {
  const [first, ...rest] = row.alsoIn;
  return (
    <li className="overview-row work-row">
      <Thumb src={row.imageUrl} project={false} />
      <span className="overview-row-text">
        <span className="overview-row-title" dir="auto">
          {row.title}
        </span>
        <span className="overview-row-meta">
          {row.meta}
          {row.by && (
            <>
              {" · by "}
              <IntentLink href={row.by.href} className="work-row-by">
                {row.by.name}
              </IntentLink>
            </>
          )}
        </span>
      </span>
      {first && (
        <span className="work-chips" title={`Also in ${row.alsoIn.join(", ")}`}>
          <span className="visually-hidden">Also in </span>
          <span className="work-chip" dir="auto">
            {first}
          </span>
          {rest.length > 0 && (
            <span className="work-chip">
              <span aria-hidden>+{rest.length}</span>
              <span className="visually-hidden"> and {rest.length} more</span>
            </span>
          )}
        </span>
      )}
    </li>
  );
}

function FolderView({
  folder,
  rows,
  open,
  onToggle,
  query,
}: {
  folder: WorkFolder;
  rows: WorkRow[];
  open: boolean;
  onToggle: (open: boolean) => void;
  query: string;
}) {
  return (
    <li className="work-folder">
      <details open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
        <summary className="work-folder-head">
          <ChevronRight size={16} aria-hidden className="work-folder-chevron" />
          <Thumb src={folder.imageUrl} project={folder.href !== null} />
          <span className="overview-row-text">
            <span className="work-folder-title" dir="auto">
              {folder.title}
            </span>
            <span className="overview-row-meta">{folder.meta}</span>
          </span>
        </summary>
        {rows.length > 0 ? (
          <ul className="work-rows">
            {rows.map((row) => (
              <Row key={row.uri} row={row} />
            ))}
          </ul>
        ) : (
          <p className="work-folder-empty">
            {query ? "No activities in this project match." : "No activities in this project yet."}
          </p>
        )}
      </details>
      {folder.href && (
        <IntentLink
          href={folder.href}
          className="work-folder-open"
          aria-label={`Open ${folder.title}`}
          title="Open project"
        >
          <ArrowRight size={16} aria-hidden />
        </IntentLink>
      )}
    </li>
  );
}

export function WorkFolders({ folders, note }: { folders: WorkFolder[]; note: string | null }) {
  const [query, setQuery] = useState("");
  // Folders opened or closed by hand; the rest follow OPEN_BY_DEFAULT.
  const [opened, setOpened] = useState<ReadonlyMap<string, boolean>>(new Map());
  const q = query.trim().toLowerCase();

  if (folders.length === 0) {
    return (
      <EmptyState
        title="No projects or activities yet"
        description="An activity records a piece of work. Group activities into projects, like folders, to show how they fit together; one activity can sit in several projects."
        action={<NewButtons />}
      />
    );
  }

  // While searching, a folder shows when its name or any activity in it
  // matches, open, with the matching activities (all of them when its name
  // matches).
  const shown = folders.flatMap((folder) => {
    if (!q) return [{ folder, rows: folder.rows }];
    if (matches(folder.title, q)) return [{ folder, rows: folder.rows }];
    const rows = folder.rows.filter((row) => matches(row.title, q));
    return rows.length > 0 ? [{ folder, rows }] : [];
  });
  const openByDefault = folders.length <= OPEN_BY_DEFAULT;

  return (
    <section className="work" aria-label="Projects and activities">
      <Toolbar query={query} onQuery={setQuery} />
      {shown.length === 0 ? (
        <EmptyState
          title={`Nothing matches "${query.trim()}".`}
          action={
            <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <ul className="work-folders">
          {shown.map(({ folder, rows }) => (
            <FolderView
              key={folder.key}
              folder={folder}
              rows={rows}
              query={q}
              open={Boolean(q) || (opened.get(folder.key) ?? openByDefault)}
              onToggle={(open) => {
                // <details> reports its own toggles, also the ones the search causes.
                if (!q) setOpened((prev) => new Map(prev).set(folder.key, open));
              }}
            />
          ))}
        </ul>
      )}
      {note && <p className="work-note">{note}</p>}
    </section>
  );
}

/** Shaped like the toolbar and three folders, so nothing moves when they arrive. */
export function WorkFoldersSkeleton() {
  return (
    <div className="work" aria-hidden>
      <div className="work-toolbar">
        <Skeleton variant="box" className="skeleton-search" />
        <NewButtons />
      </div>
      <div className="work-folders">
        {[0, 1, 2].map((i) => (
          <div key={i} className="work-folder">
            <div className="work-folder-head">
              <Skeleton variant="box" className="overview-thumb" />
              <Skeleton variant="text" lines={2} className="overview-row-text" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
