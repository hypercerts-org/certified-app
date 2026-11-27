"use client";

import { ErrorMessage, Text } from "@hypercerts-org/ui-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { saveProfileMedia } from "@/lib/hypercerts/profile-actions";
import { queryKeys } from "@/lib/query-keys";
import { SettingsAction, SettingsRow } from "./settings-frame";

const MAX_SMALL_IMAGE = 5_000_000;
const MAX_LARGE_IMAGE = 10_000_000;

export function NotSet({ label = "Not set" }: { label?: string }) {
  return (
    <Text size="body-sm" tone="muted">
      {label}
    </Text>
  );
}

export function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** Upload / delete row for profile `avatar`, `banner`, or organization `logo`. */
export function ProfileMediaRow({
  repo,
  slot,
  expectedCid,
  label,
  description,
  ariaLabel,
  hasImage,
  disabled,
  updatedToast,
  removedToast,
  onChange,
  children,
}: {
  repo: string;
  slot: "avatar" | "banner" | "logo";
  expectedCid: string | null;
  label: string;
  description: string;
  ariaLabel: string;
  hasImage: boolean;
  disabled?: boolean;
  updatedToast: string;
  removedToast: string;
  onChange: (next: { cid: string | null; url: string | null }) => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const maxSize = slot === "banner" ? MAX_LARGE_IMAGE : MAX_SMALL_IMAGE;
    if (file.size > maxSize) {
      setError(`Image must be under ${maxSize === MAX_LARGE_IMAGE ? "10 MB" : "5 MB"}.`);
      return;
    }

    setBusy("upload");
    setError(null);
    try {
      const formData = new FormData();
      formData.set("repo", repo);
      formData.set("slot", slot);
      formData.set("expectedCid", expectedCid ?? "");
      formData.set("file", file);

      const result = await saveProfileMedia(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onChange({ cid: result.cid, url: result.url });
      toast.success(updatedToast);
      void queryClient.invalidateQueries({ queryKey: queryKeys.myOrganizations });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async () => {
    setBusy("remove");
    setError(null);
    try {
      const formData = new FormData();
      formData.set("repo", repo);
      formData.set("slot", slot);
      formData.set("expectedCid", expectedCid ?? "");
      formData.set("remove", "true");

      const result = await saveProfileMedia(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onChange({ cid: result.cid, url: null });
      toast.success(removedToast);
      void queryClient.invalidateQueries({ queryKey: queryKeys.myOrganizations });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsRow
      label={label}
      description={description}
      actions={
        <>
          {hasImage && (
            <SettingsAction
              tone="muted"
              onClick={() => void handleRemove()}
              disabled={busy !== null || disabled}
            >
              {busy === "remove" ? "Updating…" : "Delete"}
            </SettingsAction>
          )}
          <SettingsAction
            onClick={() => inputRef.current?.click()}
            disabled={busy !== null || disabled}
          >
            {busy === "upload" ? "Uploading…" : "Upload"}
          </SettingsAction>
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="visually-hidden"
        aria-label={ariaLabel}
        onChange={(e) => void handleUpload(e)}
      />
      {children}
      {error && <ErrorMessage live>{error}</ErrorMessage>}
    </SettingsRow>
  );
}
