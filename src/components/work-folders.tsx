"use client";

// Projects and activities, after the staging redesign's Workspace section:
// each project a folder holding its activities, then "Without a project" for
// the account's activities that sit in none. One activity can sit in several
// projects, so it shows in each, with a chip naming the others.
//
// The rows arrive rendered by the server (work-page data, cached); this
// component only adds the search and remembers folders opened by hand.
// Folders are <details>, so they open and close without JavaScript. New
// activity and New project open their forms; deleting, and moving activities
// between projects, come later.

import { Button, SearchInput, Skeleton } from "@hypercerts-org/ui-react";
import { ArrowRight, ChevronRight, FolderGit2, Plus, SearchX } from "lucide-react";
import { useState } from "react";
import { ActorLink } from "@/components/actor";
import { projectHref } from "@/components/cards";
import { Empty } from "@/components/empty";
import { IntentLink } from "@/components/intent-link";
import {
  ActivityRow,
  activityCount,
  ProjectRow,
  RecordRow,
  RecordRowSkeleton,
} from "@/components/records";
import type { ActivityCard, ProjectCard } from "@/lib/hypercerts/views";

/** An activity in a folder, with the other projects it sits in. */
export type WorkRow = {
  activity: ActivityCard;
  alsoIn: string[];
};

/** A project and its activities; `project` null for "Without a project". */
export type WorkFolder = {
  key: string;
  project: ProjectCard | null;
  rows: WorkRow[];
  /** The workspace's account: activities by others name their author. */
  owner: string;
};

/** Up to this many folders start open, as on staging. */
const OPEN_BY_DEFAULT = 3;

const matches = (text: string, query: string) => text.toLowerCase().includes(query);

function Toolbar({
  query,
  onQuery,
  section,
}: {
  query: string;
  onQuery: (query: string) => void;
  section: string;
}) {
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
      <NewButtons section={section} />
    </div>
  );
}

/**
 * New activity and New project: their forms, under the section's address
 * (`section`; null in the skeleton, where they are inert).
 */
function NewButtons({ section }: { section: string | null }) {
  const href = (form: string) => (section ? `${section}/${form}` : undefined);
  return (
    <div className="work-actions">
      <Button href={href("new-activity")} variant="primary" size="sm" disabled={!section}>
        <Plus size={16} aria-hidden />
        New activity
      </Button>
      <Button href={href("new-project")} variant="secondary" size="sm" disabled={!section}>
        <Plus size={16} aria-hidden />
        New project
      </Button>
    </div>
  );
}

/** An activity in a folder: other projects it is in as chips, and its author when not the account's. */
function Row({ row, owner }: { row: WorkRow; owner: string }) {
  const { activity, alsoIn } = row;
  const [first, ...rest] = alsoIn;
  return (
    <li className="work-row">
      <ActivityRow
        activity={activity}
        end={
          (first || activity.author.did !== owner) && (
            <>
              {first && (
                <span className="work-chips" title={`Also in ${alsoIn.join(", ")}`}>
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
              {activity.author.did !== owner && (
                <ActorLink actor={activity.author} className="list-item-who" />
              )}
            </>
          )
        }
      />
    </li>
  );
}

const chevron = <ChevronRight size={16} aria-hidden className="work-folder-chevron" />;

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
        {/* The head opens the folder; the arrow beside it opens the project. */}
        <summary className="work-folder-head">
          {folder.project ? (
            <ProjectRow project={folder.project} href={null} start={chevron} />
          ) : (
            <RecordRow
              kind="project"
              title="Without a project"
              meta={activityCount(folder.rows.length)}
              imageUrl={null}
              href={null}
              start={chevron}
            />
          )}
        </summary>
        {rows.length > 0 ? (
          <ul className="work-rows">
            {rows.map((row) => (
              <Row key={row.activity.uri} row={row} owner={folder.owner} />
            ))}
          </ul>
        ) : (
          <p className="work-folder-empty">
            {query ? "No activities in this project match." : "No activities in this project yet."}
          </p>
        )}
      </details>
      {folder.project && (
        <IntentLink
          href={projectHref(folder.project)}
          className="work-folder-open"
          aria-label={`Open ${folder.project.title}`}
          title="Open project"
        >
          <ArrowRight size={16} aria-hidden />
        </IntentLink>
      )}
    </li>
  );
}

/** `section`: this page's address, under which New activity and New project are. */
export function WorkFolders({
  folders,
  note,
  section,
}: {
  folders: WorkFolder[];
  note: string | null;
  section: string;
}) {
  const [query, setQuery] = useState("");
  // Folders opened or closed by hand; the rest follow OPEN_BY_DEFAULT.
  const [opened, setOpened] = useState<ReadonlyMap<string, boolean>>(new Map());
  const q = query.trim().toLowerCase();

  if (folders.length === 0) {
    return (
      <Empty
        icon={FolderGit2}
        title="No projects or activities yet"
        description="An activity records a piece of work. Group activities into projects, like folders, to show how they fit together; one activity can sit in several projects."
        action={<NewButtons section={section} />}
      />
    );
  }

  // While searching, a folder shows when its name or any activity in it
  // matches, open, with the matching activities (all of them when its name
  // matches).
  const shown = folders.flatMap((folder) => {
    if (!q) return [{ folder, rows: folder.rows }];
    if (matches(folder.project?.title ?? "Without a project", q))
      return [{ folder, rows: folder.rows }];
    const rows = folder.rows.filter((row) => matches(row.activity.title, q));
    return rows.length > 0 ? [{ folder, rows }] : [];
  });
  const openByDefault = folders.length <= OPEN_BY_DEFAULT;

  return (
    <section className="work" aria-label="Projects and activities">
      <Toolbar query={query} onQuery={setQuery} section={section} />
      {shown.length === 0 ? (
        <Empty
          icon={SearchX}
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
        <NewButtons section={null} />
      </div>
      <div className="work-folders">
        {[0, 1, 2].map((i) => (
          <div key={i} className="work-folder">
            <div className="work-folder-head">
              <RecordRowSkeleton />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
