// What others add to a project or an activity, as its timeline's posts show
// it (record-timeline): an evaluation, a measurement, an update or another
// attachment, each with its files; and, for an activity's side column, the
// projects it is part of.

import { Card, ExpandableText, Heading, IdentityLink, Text } from "@hypercerts-org/ui-react";
import {
  AudioLines,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  type LucideIcon,
  Newspaper,
  Paperclip,
} from "lucide-react";
import { actorHref, identityOf } from "@/components/actor";
import { ProjectRow } from "@/components/records";
import { RichText } from "@/components/rich-text";
import { type EvaluationWithEvaluators, getProjectsWith } from "@/lib/hypercerts/queries";
import type { Attachment, Evaluation, FileLink, Measurement } from "@/lib/hypercerts/views";

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
export function EvaluatorNames({
  evaluators,
}: {
  evaluators: EvaluationWithEvaluators["evaluators"];
}) {
  const [first, second, ...rest] = evaluators;
  if (!first) return <span>An evaluator</span>;
  return (
    <span>
      <IdentityLink {...identityOf(first)} href={actorHref(first)} avatar={false} />
      {second && rest.length === 0 && (
        <>
          {" and "}
          <IdentityLink {...identityOf(second)} href={actorHref(second)} avatar={false} />
        </>
      )}
      {second && rest.length > 0 && ` and ${rest.length + 1} others`}
    </span>
  );
}

function EvaluationScore({ score }: { score: NonNullable<Evaluation["score"]> }) {
  return (
    <span
      className="evaluation-score"
      title={`Scored ${score.value} on a scale from ${score.min} to ${score.max}`}
    >
      <strong>{score.value}</strong>
      <span>/ {score.max}</span>
    </span>
  );
}

function EvaluationText({ evaluation }: { evaluation: Evaluation }) {
  return (
    <>
      {evaluation.summary && (
        <ExpandableText lines={4} className="expandable-fade">
          <Text relaxed className="prewrap" dir="auto">
            {evaluation.summary}
          </Text>
        </ExpandableText>
      )}
      <Files files={evaluation.files} />
    </>
  );
}

/** An evaluation in a timeline post: its score, then what it says. */
export function EvaluationBody({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="evaluation">
      {evaluation.score && <EvaluationScore score={evaluation.score} />}
      <EvaluationText evaluation={evaluation} />
    </div>
  );
}

// Measurements ---------------------------------------------------------------

/** The value with its unit, unless the value already says it ("30,000 records"). */
function withUnit({ value, unit }: Measurement): string {
  if (!unit || value.toLowerCase().includes(unit.toLowerCase())) return value;
  return unit === "%" ? `${value}%` : `${value} ${unit}`;
}

/**
 * A measurement in a timeline post: the value, what it is, how, and its
 * sources (the post's date is when it was measured).
 */
export function MeasurementBody({ measurement }: { measurement: Measurement }) {
  return (
    <div className="measurement">
      <span className="measurement-value">{withUnit(measurement)}</span>
      <span className="measurement-metric" dir="auto">
        {measurement.metric}
      </span>
      {measurement.method && <span className="measurement-meta">{measurement.method}</span>}
      {measurement.comment && (
        <span className="measurement-comment" dir="auto">
          {measurement.comment}
        </span>
      )}
      <Files files={measurement.files} />
    </div>
  );
}

// Updates --------------------------------------------------------------------

/** An update in a timeline post: its title, text (long ones fold) and files. */
export function UpdateBody({ update }: { update: Attachment }) {
  return (
    <>
      <Heading level={3} size="heading">
        <span dir="auto">{update.title}</span>
      </Heading>
      {update.body && (
        <ExpandableText lines={4} className="expandable-fade">
          <RichText text={update.body} />
        </ExpandableText>
      )}
      <Files files={update.files} />
    </>
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

/**
 * An attachment in a timeline post, whose line already says its kind and
 * date: its icon, its title (a document's opens it), the opened file's kind
 * ("PDF"); pictures and recordings show below.
 */
export function AttachmentBody({ attachment }: { attachment: Attachment }) {
  const Icon = KIND_ICON[attachment.kind] ?? Paperclip;
  const main = attachment.files.find((file) => !file.thumbnail && !file.audio);
  const rest = attachment.files.filter((file) => file !== main);
  return (
    <div className="attachment">
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
        {main?.label && <span className="attachment-meta">{main.label}</span>}
        {rest.length > 0 && <Files files={rest} />}
      </span>
    </div>
  );
}
