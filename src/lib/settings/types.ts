// Shared result types for settings Server Actions (imported by both Server
// Actions and Client Components).

import type { EstablishResult } from "@/lib/auth/elevated-session";
import type { ActorCard } from "@/lib/hypercerts/views";

export type ActionFailure = { ok: false; message: string; locked?: boolean };
export type SimpleResult = { ok: true } | ActionFailure;

export type UnlockActionResult =
  | { ok: true; status: EstablishResult["status"]; message?: string }
  | { ok: false; message: string };

export type EmailInfoResult =
  | { ok: true; email: string | null; emailConfirmed: boolean }
  | ActionFailure;

export type AppPasswordInfo = {
  name: string;
  createdAt: string;
  privileged?: boolean;
};

export type CreatedAppPassword = {
  name: string;
  password: string;
  createdAt: string;
};

export type PromoteToGroupResult =
  | { ok: true; status: "ok"; groupDid: string; handle: string }
  | {
      ok: true;
      status: "twoFactorRequired" | "invalidCode" | "invalid" | "rateLimited" | "unavailable";
      message?: string;
    }
  | { ok: false; message: string };

export type SocialGraphComparison = {
  certifiedCount: number;
  blueskyCount: number;
  inBothCount: number;
  onlyBluesky: ActorCard[];
  onlyCertified: ActorCard[];
  certifiedTruncated: boolean;
  blueskyTruncated: boolean;
};

export type SocialGraphSyncBatchResult = {
  ok: true;
  imported: number;
  failed: number;
  errors: { subjectDid: string; message: string }[];
};
