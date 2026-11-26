"use client";

import {
  Banner,
  Button,
  Checkbox,
  ResponsiveDialog,
  SearchInput,
  Text,
} from "@hypercerts-org/ui-react";
import { Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ActorAvatar, ActorName } from "@/components/actor";
import { StatRow } from "@/components/stat-row";
import { type ActorCard, nameOf } from "@/lib/hypercerts/views";
import {
  compareSocialGraph,
  exportCertifiedFollowsToBluesky,
  importBlueskyFollows,
  type SocialGraphComparison,
} from "@/lib/settings-actions";
import { SettingsAction, SettingsGroup, SettingsRow, SettingsRowsSkeleton } from "./settings-frame";

const CHUNK_SIZE = 50;

type Direction = "import" | "export";

/**
 * Compares an account's Certified follows against its Bluesky follows and
 * lets the user selectively import (Bluesky → Certified) or, for personal
 * accounts, export (Certified → Bluesky).
 */
export function BlueskySyncSection({
  repoDid,
  allowExport,
  description = "Your follows on Certified and on Bluesky are kept apart. Choose which accounts to sync before anything changes.",
}: {
  repoDid: string;
  allowExport: boolean;
  description?: string;
}) {
  const [data, setData] = useState<SocialGraphComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [direction, setDirection] = useState<Direction | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{
    imported: number;
    failed: number;
    total: number;
  } | null>(null);
  const cancelRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await compareSocialGraph(repoDid);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [repoDid]);

  useEffect(() => {
    void load();
  }, [load]);

  const candidates: ActorCard[] = useMemo(() => {
    if (!data || !direction) return [];
    return direction === "import" ? data.onlyBluesky : data.onlyCertified;
  }, [data, direction]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((actor) => {
      const name = nameOf(actor).toLowerCase();
      const handle = actor.handle?.toLowerCase() ?? "";
      return name.includes(q) || handle.includes(q) || actor.did.toLowerCase().includes(q);
    });
  }, [candidates, query]);

  const openModal = (dir: Direction) => {
    if (!data) return;
    const list = dir === "import" ? data.onlyBluesky : data.onlyCertified;
    setDirection(dir);
    setSelected(new Set(list.map((a) => a.did)));
    setQuery("");
    setResult(null);
    setProgress({ done: 0, total: 0 });
    cancelRef.current = false;
  };

  const closeModal = () => {
    if (syncing) {
      cancelRef.current = true;
      return;
    }
    const hadResult = result !== null;
    setDirection(null);
    setResult(null);
    if (hadResult) void load();
  };

  const toggleDid = (did: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(did)) next.delete(did);
      else next.add(did);
      return next;
    });
  };

  const runSync = async () => {
    if (!direction || selected.size === 0 || syncing) return;
    const dids = [...selected];
    setSyncing(true);
    cancelRef.current = false;
    setProgress({ done: 0, total: dids.length });
    let imported = 0;
    let failed = 0;
    try {
      for (let i = 0; i < dids.length; i += CHUNK_SIZE) {
        if (cancelRef.current) break;
        const batch = dids.slice(i, i + CHUNK_SIZE);
        const res =
          direction === "import"
            ? await importBlueskyFollows(repoDid, batch)
            : await exportCertifiedFollowsToBluesky(batch);
        if (!res.ok) {
          failed += batch.length;
          toast.error(res.message);
          break;
        }
        imported += res.imported;
        failed += res.failed;
        setProgress({ done: Math.min(i + batch.length, dids.length), total: dids.length });
      }
      setResult({ imported, failed, total: dids.length });
      if (imported > 0) {
        toast(
          direction === "import"
            ? `Imported ${imported} ${imported === 1 ? "follow" : "follows"} into Certified`
            : `Added ${imported} ${imported === 1 ? "follow" : "follows"} on Bluesky`,
        );
      }
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !data) {
    return <SettingsRowsSkeleton rows={2} />;
  }

  if (error && !data) {
    return (
      <SettingsGroup title="Sync with Bluesky" description={description}>
        <SettingsRow
          label="Comparison"
          actions={<SettingsAction onClick={() => void load()}>Try again</SettingsAction>}
        >
          <Banner tone="danger">{error}</Banner>
        </SettingsRow>
      </SettingsGroup>
    );
  }

  if (!data) return null;

  const truncatedImport = data.certifiedTruncated || data.blueskyTruncated;
  const truncatedExport = data.blueskyTruncated;
  const inSync = data.onlyBluesky.length === 0 && (!allowExport || data.onlyCertified.length === 0);

  return (
    <>
      <SettingsGroup
        title="Sync with Bluesky"
        description={description}
        action={
          <SettingsAction tone="muted" disabled={loading} onClick={() => void load()}>
            Refresh
          </SettingsAction>
        }
      >
        <SettingsRow
          label="Follow graphs"
          description="Comparing records on your personal data server."
        >
          <StatRow
            label="Follow counts"
            stats={[
              { label: "Certified follows", value: data.certifiedCount },
              { label: "Bluesky follows", value: data.blueskyCount },
              { label: "In both", value: data.inBothCount },
            ]}
          />
          {truncatedImport && (
            <Banner tone="warning">
              One of your follow lists has more than 10,000 accounts, so automatic diffing is paused
              to avoid creating duplicate follows.
            </Banner>
          )}
          {inSync && !truncatedImport && (
            <Text size="body-sm" tone="muted">
              Certified and Bluesky follow graphs are in sync.
            </Text>
          )}
        </SettingsRow>

        <SettingsRow
          label="Bluesky → Certified"
          description="Bring accounts you follow on Bluesky into your Certified feed."
          actions={
            <SettingsAction
              disabled={truncatedImport || data.onlyBluesky.length === 0}
              onClick={() => openModal("import")}
            >
              Import
            </SettingsAction>
          }
        >
          <Text size="body-sm" tone={data.onlyBluesky.length > 0 ? "ink" : "muted"}>
            {data.onlyBluesky.length === 0
              ? "Nothing new to import"
              : `${data.onlyBluesky.length} ${data.onlyBluesky.length === 1 ? "account" : "accounts"} only on Bluesky`}
          </Text>
        </SettingsRow>

        {allowExport && (
          <SettingsRow
            label="Certified → Bluesky"
            description="Follow on Bluesky the accounts you currently follow on Certified."
            actions={
              <SettingsAction
                disabled={truncatedExport || data.onlyCertified.length === 0}
                onClick={() => openModal("export")}
              >
                Follow on Bluesky
              </SettingsAction>
            }
          >
            <Text size="body-sm" tone={data.onlyCertified.length > 0 ? "ink" : "muted"}>
              {data.onlyCertified.length === 0
                ? "Nothing new to export"
                : `${data.onlyCertified.length} ${data.onlyCertified.length === 1 ? "account" : "accounts"} only on Certified`}
            </Text>
          </SettingsRow>
        )}
      </SettingsGroup>

      <ResponsiveDialog
        open={direction !== null}
        onClose={closeModal}
        title={
          direction === "import" ? "Import follows from Bluesky" : "Follow accounts on Bluesky"
        }
        description={
          result
            ? undefined
            : direction === "import"
              ? "Choose which accounts you follow on Bluesky to also follow on Certified."
              : "Choose which accounts you follow on Certified to also follow on Bluesky."
        }
        footer={
          result ? (
            <Button variant="primary" onClick={closeModal}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={closeModal}>
                {syncing ? "Stop" : "Cancel"}
              </Button>
              <Button
                variant="primary"
                loading={syncing}
                disabled={selected.size === 0 || syncing}
                onClick={() => void runSync()}
              >
                {syncing
                  ? `${progress.done} of ${progress.total}…`
                  : direction === "import"
                    ? `Import ${selected.size}`
                    : `Follow ${selected.size}`}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="settings-sync-result">
            <Users size={20} aria-hidden />
            <Text tone="ink">
              {direction === "import" ? "Imported" : "Added"}{" "}
              <strong>
                {result.imported} of {result.total}
              </strong>{" "}
              {result.imported === 1 ? "follow" : "follows"}.
              {result.failed > 0 ? ` ${result.failed} failed.` : ""}
            </Text>
          </div>
        ) : (
          <div className="stack">
            <div className="settings-sync-toolbar">
              <SearchInput
                label="Filter accounts"
                placeholder="Filter by name or handle"
                value={query}
                onChange={setQuery}
                disabled={syncing}
              />
              <div className="settings-inline-actions">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={syncing}
                  onClick={() => setSelected(new Set(filtered.map((a) => a.did)))}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={syncing}
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
            <ul className="divided settings-sync-list">
              {filtered.map((actor) => (
                <li key={actor.did} className="settings-sync-row">
                  <Checkbox
                    checked={selected.has(actor.did)}
                    onChange={() => toggleDid(actor.did)}
                    disabled={syncing}
                    label={
                      <span className="settings-sync-actor">
                        <ActorAvatar actor={actor} size="sm" />
                        <span className="settings-sync-actor-text">
                          <ActorName actor={actor} />
                          {actor.handle && (
                            <Text as="span" size="body-sm" tone="muted">
                              @{actor.handle}
                            </Text>
                          )}
                        </span>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
}
