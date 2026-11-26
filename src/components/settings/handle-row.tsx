"use client";

import {
  Banner,
  Button,
  CopyableId,
  Field,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  ResponsiveDialog,
  Text,
} from "@hypercerts-org/ui-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { HandleId } from "@/components/account-ids";
import { updateOwnHandle } from "@/lib/settings/account-actions";
import type { SimpleResult } from "@/lib/settings/types";
import { isHandle, isHandleLabel } from "@/lib/validate";
import { SettingsAction, SettingsRow } from "./settings-frame";

function isSubdomainOfPds(handle: string | null, pdsDomain: string): boolean {
  if (!handle) return false;
  return (
    handle.endsWith(`.${pdsDomain}`) ||
    handle.endsWith(".certified.app") ||
    handle.endsWith(".certs.social") ||
    handle.split(".").length >= 3
  );
}

function suffixOf(handle: string | null, pdsDomain: string): string {
  if (handle?.includes(".") && isSubdomainOfPds(handle, pdsDomain)) {
    return handle.slice(handle.indexOf(".") + 1);
  }
  return pdsDomain;
}

/** Account handle row: subdomain inline edit plus custom-domain DNS wizard. */
export function HandleRow({
  did,
  initialHandle,
  pdsDomain,
  description = "The @handle people use to find and mention you.",
  onSave,
}: {
  did: string;
  initialHandle: string | null;
  pdsDomain: string;
  description?: string;
  onSave?: (handle: string) => Promise<SimpleResult>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const domainFormId = useId();
  const [handle, setHandle] = useState(initialHandle);
  const [editing, setEditing] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [domainOpen, setDomainOpen] = useState(false);
  const [domainStep, setDomainStep] = useState<"enter" | "dns" | "done">("enter");
  const [domainInput, setDomainInput] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const suffix = suffixOf(handle, pdsDomain);
  const saveHandle = onSave ?? updateOwnHandle;

  const openEdit = () => {
    const currentPrefix =
      handle && isSubdomainOfPds(handle, pdsDomain) ? handle.slice(0, handle.indexOf(".")) : "";
    setPrefix(currentPrefix);
    setError(null);
    setEditing(true);
  };

  const submitSubdomain = async () => {
    const clean = prefix.trim().toLowerCase();
    if (clean.length < 3 || !isHandleLabel(clean)) {
      setError(
        "Use 3–63 lowercase letters, numbers, or hyphens (cannot start or end with a hyphen).",
      );
      return;
    }
    const next = `${clean}.${suffix}`;
    setSaving(true);
    setError(null);
    try {
      const res = await saveHandle(next);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setHandle(next);
      setEditing(false);
      toast(`Handle updated to @${next}`);
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const normalizedDomain = domainInput.trim().toLowerCase().replace(/^@/, "");
  const dnsHost = `_atproto.${normalizedDomain}`;
  const dnsValue = `did=${did}`;

  const advanceToDns = () => {
    if (!isHandle(normalizedDomain)) {
      setDomainError("Enter a valid domain name (for example, example.org).");
      return;
    }
    setDomainError(null);
    setDomainStep("dns");
  };

  const verifyCustomDomain = async () => {
    setVerifying(true);
    setDomainError(null);
    try {
      const res = await saveHandle(normalizedDomain);
      if (!res.ok) {
        setDomainError(res.message);
        return;
      }
      setHandle(normalizedDomain);
      setDomainStep("done");
      toast(`Handle updated to @${normalizedDomain}`);
      void queryClient.invalidateQueries({ queryKey: ["me", "organizations"] });
      router.refresh();
    } finally {
      setVerifying(false);
    }
  };

  const closeDomain = () => {
    if (verifying) return;
    setDomainOpen(false);
    setDomainStep("enter");
    setDomainInput("");
    setDomainError(null);
  };

  return (
    <>
      <SettingsRow
        label="Handle"
        description={description}
        actions={
          editing ? null : (
            <>
              <SettingsAction
                tone="muted"
                onClick={() => {
                  setDomainStep("enter");
                  setDomainInput("");
                  setDomainError(null);
                  setDomainOpen(true);
                }}
              >
                Custom domain
              </SettingsAction>
              <SettingsAction onClick={openEdit}>Edit</SettingsAction>
            </>
          )
        }
      >
        {editing ? (
          <form
            className="settings-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitSubdomain();
            }}
          >
            <Field label="New handle" error={error ?? undefined}>
              {({ invalid: _invalid, ...inputField }) => (
                <InputGroup>
                  <InputGroupInput
                    {...inputField}
                    value={prefix}
                    onChange={(e) => setPrefix(e.currentTarget.value)}
                    placeholder="your-name"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={saving}
                  />
                  <InputGroupAddon>.{suffix}</InputGroupAddon>
                </InputGroup>
              )}
            </Field>
            <div className="settings-form-actions">
              <Button type="submit" variant="primary" size="sm" loading={saving}>
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : handle ? (
          <HandleId handle={handle} />
        ) : (
          <Text size="body-sm" tone="muted">
            No handle verified
          </Text>
        )}
      </SettingsRow>

      <ResponsiveDialog
        open={domainOpen}
        onClose={closeDomain}
        title="Use your own domain"
        description={
          domainStep === "enter"
            ? "Use a domain you control (such as example.org or team.example.org) as your AT Protocol handle."
            : domainStep === "dns"
              ? "Add this TXT record in your domain's DNS settings, then verify."
              : "Your custom domain is active."
        }
        footer={
          domainStep === "enter" ? (
            <>
              <Button variant="secondary" onClick={closeDomain}>
                Cancel
              </Button>
              <Button type="submit" form={domainFormId} variant="primary">
                Next
              </Button>
            </>
          ) : domainStep === "dns" ? (
            <>
              <Button
                variant="secondary"
                disabled={verifying}
                onClick={() => {
                  setDomainError(null);
                  setDomainStep("enter");
                }}
              >
                Back
              </Button>
              <Button
                variant="primary"
                loading={verifying}
                onClick={() => void verifyCustomDomain()}
              >
                Verify DNS record
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={closeDomain}>
              Done
            </Button>
          )
        }
      >
        {domainStep === "enter" && (
          <form
            id={domainFormId}
            className="stack"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              advanceToDns();
            }}
          >
            <Field label="Domain name" error={domainError ?? undefined}>
              {(field) => (
                <Input
                  {...field}
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.currentTarget.value)}
                  placeholder="example.org"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              )}
            </Field>
          </form>
        )}

        {domainStep === "dns" && (
          <div className="stack">
            <dl className="facts">
              <div className="fact">
                <dt>Type</dt>
                <dd>
                  <Text as="span" size="body-sm" tone="ink">
                    TXT
                  </Text>
                </dd>
              </div>
              <div className="fact">
                <dt>Host</dt>
                <dd>
                  <CopyableId
                    value={dnsHost}
                    displayValue={dnsHost}
                    label="DNS host"
                    className="account-id"
                  />
                </dd>
              </div>
              <div className="fact">
                <dt>Value</dt>
                <dd>
                  <CopyableId
                    value={dnsValue}
                    displayValue={dnsValue}
                    label="DNS value"
                    className="account-id"
                  />
                </dd>
              </div>
            </dl>
            <Text size="body-sm" tone="muted">
              DNS changes can take a few minutes to propagate. If verification fails, wait a moment
              and try again.
            </Text>
            {domainError && (
              <Banner tone="danger" role="alert">
                {domainError}
              </Banner>
            )}
          </div>
        )}

        {domainStep === "done" && (
          <Banner tone="success">
            Your handle is now <strong>@{normalizedDomain}</strong>.
          </Banner>
        )}
      </ResponsiveDialog>
    </>
  );
}
