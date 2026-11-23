// What others add to an activity or a project, for its page: evaluations,
// measurements, updates and other attachments, and (for an activity) the
// projects it is part of. Each fetches its own records and shows nothing when
// there are none: no one looks for an evaluation that isn't there. Main
// sections are tiles (Evaluations, Updates); short facts go in the side
// column as cards (Part of, Measured, Attachments).

import { Card, ExpandableText, Heading, Skeleton, Text } from "@hypercerts-org/ui-react";
import {
  AudioLines,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  type LucideIcon,
  Newspaper,
  Paperclip,
} from "lucide-react";
import { ActorAvatar, ActorLink } from "@/components/actor";
import { skeletonSlots } from "@/components/cards";
import { ProjectRow } from "@/components/records";
import { RichText } from "@/components/rich-text";
import { Tile } from "@/components/tile";
import {
  type EvaluationWithEvaluators,
  getAttachments,
  getEvaluations,
  getMeasurements,
  getProjectsWith,
} from "@/lib/hypercerts/queries";
import { type Attachment, type FileLink, humanize, type Measurement } from "@/lib/hypercerts/views";

/** Pictures shown before the rest fold into "+N". */
const SHOWN_PICTURES = 6;

/**
 * A record's files: pictures as a grid of thumbnails (each opens the full
 * size), sound files as players, the rest as links; all open in a new tab.
 */
function Files({ files }: { files: FileLink[] }) {
  const pictures = files.filter((file) => file.thumbnail);
  const sounds = files.filter((file) => file.audio);
  const links = files.filter((file) => !file.thumbnail && !file.audio);
  const hidden = pictures.length - SHOWN_PICTURES;
  return (
    <>
      {pictures.length > 0 && (
        <ul className="context-pictures">
          {pictures.slice(0, SHOWN_PICTURES).map((file, i) => (
            <li key={file.href}>
              <a href={file.href} target="_blank" rel="noopener noreferrer">
                {/* biome-ignore lint/performance/noImgElement: indexed images come from many hosts */}
                <img src={file.thumbnail} alt="" loading="lazy" />
                <span className="visually-hidden">
                  Picture {i + 1} of {pictures.length} (opens in a new tab)
                </span>
                {i === SHOWN_PICTURES - 1 && hidden > 0 && (
                  <span className="context-pictures-more" aria-hidden>
                    +{hidden}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
      {sounds.map((file) => (
        // biome-ignore lint/a11y/useMediaCaption: field recordings have no speech to caption
        <audio key={file.href} className="context-audio" controls preload="none" src={file.href} />
      ))}
      {links.length > 0 && (
        <ul className="context-files">
          {links.map((file) => (
            <li key={file.href}>
              <a href={file.href} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} aria-hidden />
                {file.label}
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Part of --------------------------------------------------------------------

/** The projects an activity belongs to, as rows. */
export async function PartOf({ uri }: { uri: string }) {
  const projects = await getProjectsWith(uri);
  if (projects.length === 0) return null;
  return (
    <Card variant="panel" className="overview-box rail-card">
      <Heading level={2} size="heading">
        Part of
      </Heading>
      <ul className="context-rows">
        {projects.map((project) => (
          <li key={project.uri}>
            <ProjectRow project={project} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Evaluations ----------------------------------------------------------------

/** "Ana Lima", "Ana Lima and Bo Chen", "Ana Lima and 3 others". */
function EvaluatorNames({ evaluators }: { evaluators: EvaluationWithEvaluators["evaluators"] }) {
  const [first, second, ...rest] = evaluators;
  if (!first) return <span>An evaluator</span>;
  return (
    <span>
      <ActorLink actor={first} avatar={false} />
      {second && rest.length === 0 && (
        <>
          {" and "}
          <ActorLink actor={second} avatar={false} />
        </>
      )}
      {second && rest.length > 0 && ` and ${rest.length + 1} others`}
    </span>
  );
}

function EvaluationView({ evaluation }: { evaluation: EvaluationWithEvaluators }) {
  const { evaluators, score } = evaluation;
  return (
    <li className="evaluation">
      <div className="evaluation-head">
        <span className="evaluation-faces trust-faces" aria-hidden>
          {evaluators.slice(0, 3).map((actor) => (
            <ActorAvatar key={actor.did} actor={actor} size="sm" />
          ))}
        </span>
        <span className="evaluation-by">
          <EvaluatorNames evaluators={evaluators} />
          {evaluation.date && <span className="evaluation-date">{evaluation.date}</span>}
        </span>
        {score && (
          <span
            className="evaluation-score"
            title={`Scored ${score.value} on a scale from ${score.min} to ${score.max}`}
          >
            <strong>{score.value}</strong>
            <span>/ {score.max}</span>
          </span>
        )}
      </div>
      {evaluation.summary && (
        <ExpandableText lines={4} className="expandable-fade">
          <Text relaxed className="prewrap" dir="auto">
            {evaluation.summary}
          </Text>
        </ExpandableText>
      )}
      <Files files={evaluation.files} />
    </li>
  );
}

/** What evaluators concluded about the work. */
export async function Evaluations({ uri }: { uri: string }) {
  const evaluations = await getEvaluations(uri);
  if (evaluations.length === 0) return null;
  return (
    <Tile title="Evaluations">
      <ul className="evaluations">
        {evaluations.map((evaluation) => (
          <EvaluationView key={evaluation.uri} evaluation={evaluation} />
        ))}
      </ul>
    </Tile>
  );
}

// Measurements ---------------------------------------------------------------

/**
 * One figure per thing measured: the latest value, and how many measurements
 * there are of it when more than one (a count recorded at each event, say).
 */
function byMetric(measurements: Measurement[]) {
  const groups = new Map<string, { latest: Measurement; count: number }>();
  for (const measurement of measurements) {
    const key = `${measurement.metric.toLowerCase()}|${measurement.unit.toLowerCase()}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { latest: measurement, count: 1 });
  }
  return [...groups.values()];
}

/** The value with its unit, unless the value already says it ("30,000 records"). */
function withUnit({ value, unit }: Measurement): string {
  if (!unit || value.toLowerCase().includes(unit.toLowerCase())) return value;
  return unit === "%" ? `${value}%` : `${value} ${unit}`;
}

/** What was measured: figures, each with what, when and how. */
export async function Measurements({ uri }: { uri: string }) {
  const measurements = await getMeasurements(uri);
  if (measurements.length === 0) return null;
  return (
    <Card variant="panel" className="overview-box rail-card">
      <Heading level={2} size="heading">
        Measured
      </Heading>
      <ul className="measurements">
        {byMetric(measurements).map(({ latest, count }) => (
          <li key={latest.uri} className="measurement">
            <span className="measurement-value">{withUnit(latest)}</span>
            <span className="measurement-metric" dir="auto">
              {latest.metric}
            </span>
            <span className="measurement-meta">
              {[count > 1 ? `Latest of ${count}` : null, latest.period, latest.method]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {latest.comment && (
              <span className="measurement-comment" dir="auto">
                {latest.comment}
              </span>
            )}
            <Files files={latest.files} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Updates --------------------------------------------------------------------

/**
 * News from the work, newest first, as posts: when, the title, the text
 * (long ones fold), and its files. `ownerDid`: whose page this is; an update
 * by anyone else names its author.
 */
export async function Updates({ uri, ownerDid }: { uri: string; ownerDid: string }) {
  const { updates } = await getAttachments(uri);
  if (updates.length === 0) return null;
  return (
    <Tile title="Updates">
      <UpdateList updates={updates} ownerDid={ownerDid} fold />
    </Tile>
  );
}

/** On a page that isn't the updates' own, the latest few; the rest fold away. */
const SHOWN_UPDATES = 3;

export function UpdateList({
  updates,
  ownerDid,
  fold = false,
}: {
  updates: Attachment[];
  ownerDid: string;
  /** Show the latest few, and the rest behind "Show all". */
  fold?: boolean;
}) {
  const shown = fold ? updates.slice(0, SHOWN_UPDATES) : updates;
  const rest = fold ? updates.slice(SHOWN_UPDATES) : [];
  return (
    <>
      <ol className="updates">
        {shown.map((update) => (
          <UpdateView key={update.uri} update={update} ownerDid={ownerDid} />
        ))}
      </ol>
      {rest.length > 0 && (
        // A disclosure: opens without JavaScript, and its rows stay in the page for find.
        <details className="updates-more">
          <summary>Show all {updates.length} updates</summary>
          <ol className="updates">
            {rest.map((update) => (
              <UpdateView key={update.uri} update={update} ownerDid={ownerDid} />
            ))}
          </ol>
        </details>
      )}
    </>
  );
}

function UpdateView({ update, ownerDid }: { update: Attachment; ownerDid: string }) {
  return (
    <li className="update">
      <p className="update-meta">
        {update.date}
        {update.author.did !== ownerDid && (
          <>
            {update.date && " · "}
            by <ActorLink actor={update.author} avatar={false} />
          </>
        )}
      </p>
      <Heading level={3} size="heading" className="update-title">
        <span dir="auto">{update.title}</span>
      </Heading>
      {update.body && (
        <ExpandableText lines={4} className="expandable-fade">
          <RichText text={update.body} />
        </ExpandableText>
      )}
      <Files files={update.files} />
    </li>
  );
}

// Attachments ----------------------------------------------------------------

/** An icon for what an attachment holds, by its type. */
const KIND_ICON: Record<string, LucideIcon> = {
  report: FileText,
  audit: FileText,
  methodology: FileText,
  document: FileText,
  evidence: Paperclip,
  audio: AudioLines,
  soundscape: AudioLines,
  photo: ImageIcon,
  gallery: ImageIcon,
  testimonial: Newspaper,
};

/** Attachments shown before the rest fold away. */
const SHOWN_ATTACHMENTS = 5;

function AttachmentView({ attachment }: { attachment: Attachment }) {
  const Icon = KIND_ICON[attachment.kind] ?? Paperclip;
  // A document's title opens it; pictures and recordings show below.
  const main = attachment.files.find((file) => !file.thumbnail && !file.audio);
  const rest = attachment.files.filter((file) => file !== main);
  return (
    <li className="attachment">
      <span className="record-thumb">
        <Icon size={16} aria-hidden />
      </span>
      <span className="attachment-text">
        {main ? (
          <a
            href={main.href}
            target="_blank"
            rel="noopener noreferrer"
            className="attachment-title"
            dir="auto"
          >
            {attachment.title}
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        ) : (
          <span className="attachment-title" dir="auto">
            {attachment.title}
          </span>
        )}
        <span className="attachment-meta">
          {/* The opened file's kind ("PDF"); pictures and recordings show for themselves. */}
          {[humanize(attachment.kind), main?.label, attachment.date].filter(Boolean).join(" · ")}
        </span>
        {rest.length > 0 && <Files files={rest} />}
      </span>
    </li>
  );
}

/** Reports, recordings, photos and other files about the work: the latest few, the rest folded. */
export async function Attachments({ uri }: { uri: string }) {
  const { files } = await getAttachments(uri);
  if (files.length === 0) return null;
  const shown = files.slice(0, SHOWN_ATTACHMENTS);
  const rest = files.slice(SHOWN_ATTACHMENTS);
  return (
    <Card variant="panel" className="overview-box rail-card">
      <Heading level={2} size="heading">
        Attachments
      </Heading>
      <ul className="attachments">
        {shown.map((attachment) => (
          <AttachmentView key={attachment.uri} attachment={attachment} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="updates-more">
          <summary>Show all {files.length} attachments</summary>
          <ul className="attachments">
            {rest.map((attachment) => (
              <AttachmentView key={attachment.uri} attachment={attachment} />
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/** Whether a record has updates: for a tab that shows only when it does. */
export async function hasUpdates(uri: string): Promise<boolean> {
  return (await getAttachments(uri)).updates.length > 0;
}

/** Updates on their way: a date, a title and a few lines each. */
export function UpdatesSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="updates" aria-hidden>
      {skeletonSlots(count).map((slot) => (
        <div key={slot} className="update">
          <Skeleton variant="line" className="skeleton-card-meta" />
          <Skeleton variant="line" className="skeleton-card-title" />
          <Skeleton variant="text" lines={3} />
        </div>
      ))}
    </div>
  );
}
