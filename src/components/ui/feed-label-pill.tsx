import React from "react";
import type { LabelValue } from "@/lib/atproto/labeller";
import { LABEL_DISPLAY } from "@/lib/atproto/labeller";

const LABEL_CLASS: Record<LabelValue, string> = {
  "high-quality": "feed-card__label--high-quality",
  standard: "feed-card__label--standard",
  draft: "feed-card__label--draft",
  "likely-test": "feed-card__label--test",
};

export interface FeedLabelPillProps {
  label: LabelValue;
  className?: string;
}

/**
 * Colored pill badge indicating activity quality level.
 * Extracts the repeated label → class mapping from activity-card.tsx.
 */
export default function FeedLabelPill({ label, className = "" }: FeedLabelPillProps) {
  return (
    <span className={`feed-card__label ${LABEL_CLASS[label]} ${className}`}>
      {LABEL_DISPLAY[label]}
    </span>
  );
}
