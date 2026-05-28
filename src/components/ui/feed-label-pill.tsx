import React from "react";
import type { LabelValue } from "@/lib/atproto/labeller";
import { LABEL_DISPLAY } from "@/lib/atproto/labeller";
import Badge, { type BadgeVariant } from "@/components/ui/badge";

const LABEL_VARIANT: Record<LabelValue, BadgeVariant> = {
  "high-quality": "high-quality",
  standard: "standard",
  draft: "draft",
  "likely-test": "test",
};

export interface FeedLabelPillProps {
  label: LabelValue;
  className?: string;
}

/**
 * Activity quality pill — thin wrapper that delegates to <Badge> so
 * the four quality labels share the canonical Badge chrome instead of
 * carrying their own .feed-card__label CSS class family.
 */
export default function FeedLabelPill({ label, className = "" }: FeedLabelPillProps) {
  return (
    <Badge variant={LABEL_VARIANT[label]} className={className}>
      {LABEL_DISPLAY[label]}
    </Badge>
  );
}
