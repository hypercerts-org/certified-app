"use client";

// Pictures in a record's posts (updates, evaluations, attachments) and an
// activity's hero open here, full size over the page, rather than in a new
// tab. One picture after another in a row that scrolls and snaps: a swipe on
// a phone or a trackpad is the browser's own, the arrows and the keyboard
// step through. Built on <dialog> (showModal): it sits above everything,
// keeps focus inside, and Escape closes it.

import { Button } from "@hypercerts-org/ui-react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export type Picture = {
  /** The full size, shown in the viewer and opened by "Original". */
  src: string;
  /** The small one, in the grid. */
  thumbnail: string;
};

/** How far the arrows move: smoothly, unless the reader asked for less motion. */
function behavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
}

/** The viewer, open at picture `start` (null: closed). */
function PictureViewer({
  pictures,
  start,
  onClose,
}: {
  pictures: Picture[];
  start: number | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (start === null) {
      if (element.open) element.close();
      return;
    }
    if (!element.open) element.showModal();
    close.current?.focus();
    setIndex(start);
    // Once the open dialog is laid out: before that the row has no width.
    const frame = requestAnimationFrame(() => {
      const row = track.current;
      row?.scrollTo({ left: start * row.clientWidth, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [start]);

  const go = useCallback(
    (to: number) => {
      const row = track.current;
      if (!row) return;
      const next = Math.max(0, Math.min(pictures.length - 1, to));
      row.scrollTo({ left: next * row.clientWidth, behavior: behavior() });
    },
    [pictures.length],
  );

  const many = pictures.length > 1;
  const current = pictures[index];

  return (
    <dialog
      ref={dialog}
      className="picture-viewer"
      aria-label={many ? `Picture ${index + 1} of ${pictures.length}` : "Picture"}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(index + 1);
        else if (event.key === "ArrowLeft") go(index - 1);
        else return;
        event.preventDefault();
      }}
      onClick={(event) => {
        // Not on a picture or a control: the space around them.
        const target = event.target as HTMLElement;
        if (target.matches(".picture-slide, .picture-track")) dialog.current?.close();
      }}
    >
      {start !== null && (
        <>
          <div className="picture-bar">
            <span className="picture-count" aria-live="polite">
              {many ? `${index + 1} / ${pictures.length}` : null}
            </span>
            {current && (
              <a
                className="picture-original"
                href={current.src}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={16} aria-hidden />
                Original
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              ref={close}
              onClick={() => dialog.current?.close()}
            >
              <X size={20} />
            </Button>
          </div>
          <div
            ref={track}
            className="picture-track"
            dir="ltr"
            onScroll={(event) => {
              const row = event.currentTarget;
              setIndex(Math.round(row.scrollLeft / row.clientWidth));
            }}
          >
            {pictures.map((picture, i) => (
              <div className="picture-slide" key={picture.src}>
                {/* biome-ignore lint/performance/noImgElement: indexed images come from many hosts */}
                <img
                  src={picture.src}
                  alt={many ? `Picture ${i + 1} of ${pictures.length}` : "Picture"}
                  // The one opened and its neighbours first; the rest as they come near.
                  loading={Math.abs(i - (start ?? 0)) <= 1 ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                />
              </div>
            ))}
          </div>
          {many && (
            <>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Previous picture"
                className="picture-step picture-prev"
                disabled={index === 0}
                onClick={() => go(index - 1)}
              >
                <ChevronLeft size={20} />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Next picture"
                className="picture-step picture-next"
                disabled={index === pictures.length - 1}
                onClick={() => go(index + 1)}
              >
                <ChevronRight size={20} />
              </Button>
            </>
          )}
        </>
      )}
    </dialog>
  );
}

/** Pictures shown in the grid before the rest fold into "+N". */
const SHOWN = 6;

/**
 * A post's pictures as a grid of thumbnails; each opens the viewer there, and
 * the last one shown, "+N", leads on to the rest.
 */
export function PictureGrid({ pictures }: { pictures: Picture[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const hidden = pictures.length - SHOWN;
  return (
    <>
      <ul className="context-pictures" data-count={Math.min(pictures.length, SHOWN)}>
        {pictures.slice(0, SHOWN).map((picture, i) => (
          <li key={picture.src}>
            <button type="button" className="context-picture" onClick={() => setOpen(i)}>
              {/* biome-ignore lint/performance/noImgElement: indexed images come from many hosts */}
              <img src={picture.thumbnail} alt="" loading="lazy" />
              <span className="visually-hidden">
                View picture {i + 1} of {pictures.length}
              </span>
              {i === SHOWN - 1 && hidden > 0 && (
                <span className="context-pictures-more" aria-hidden>
                  +{hidden}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <PictureViewer pictures={pictures} start={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** One picture that opens full size in the viewer: `children` is what shows on the page. */
export function ViewablePicture({
  src,
  className,
  children,
}: {
  src: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <button
        type="button"
        className={`picture-trigger ${className ?? ""}`}
        onClick={() => setOpen(0)}
      >
        {children}
        <span className="visually-hidden">View the picture full size</span>
      </button>
      <PictureViewer
        pictures={[{ src, thumbnail: src }]}
        start={open}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
