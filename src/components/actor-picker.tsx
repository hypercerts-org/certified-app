"use client";

// An account field with suggestions as you type (/api/search?scope=actors):
// Add member, Endorse someone, Award badge, and an activity's contributors.
// Free-form text (a DID, a link, an AT-URI, a name) still submits without
// picking a row. The toolkit's Combobox does the keyboard and ARIA; spread
// Field's props into it.

import { Avatar, Combobox, ComboboxOption } from "@hypercerts-org/ui-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { avatarOf } from "@/components/actor";
import { type ActorPickerItem, actorPickerQuery } from "@/lib/query-keys";
import type { SearchActorHit } from "@/lib/search";
import { useSettled } from "@/lib/use-settled";

/** Keystrokes settle this long before a search goes out. */
const DEBOUNCE_MS = 200;
/** Shorter than this, a search would match nearly everything. */
const MIN_QUERY = 2;

/** A pasted link or AT-URI is an answer already, not a search. */
const isAddress = (q: string) => /^(https?|at):\/\//.test(q);

export function ActorPicker({
  value,
  onChange,
  onSelectActor,
  label = "Account",
  placeholder = "@alice.bsky.social",
  valueFormat = "handle",
  ...field
}: {
  value: string;
  onChange: (next: string) => void;
  onSelectActor?: (actor: SearchActorHit) => void;
  /** The input's accessible name: the Field's label. */
  label?: string;
  placeholder?: string;
  /** How a picked account fills the input: its handle (default) or its DID. */
  valueFormat?: "handle" | "did";
  id?: string;
  "aria-describedby"?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  onBlur?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // What a picked row put in the input: no search for it.
  const [picked, setPicked] = useState<string | null>(null);
  const query = useSettled(value.trim(), DEBOUNCE_MS);
  const searching = query.length >= MIN_QUERY && !isAddress(query) && query !== picked;

  const results = useQuery(actorPickerQuery(query, searching));

  const items = searching ? (results.data ?? []) : [];

  return (
    <Combobox<ActorPickerItem>
      {...field}
      label={label}
      value={value}
      onValueChange={(next) => {
        setPicked(null);
        onChange(next);
      }}
      items={items}
      open={open && searching}
      onOpenChange={setOpen}
      onSelect={(actor) => {
        const next =
          valueFormat === "did" ? actor.did : actor.handle ? `@${actor.handle}` : actor.did;
        setPicked(next);
        onChange(next);
        onSelectActor?.(actor);
        setOpen(false);
      }}
      placeholder={placeholder}
      loading={searching && results.isFetching}
      emptyMessage={null}
      renderItem={({ item, index: _index, ...option }) => (
        <ComboboxOption key={item.id} {...option}>
          <span className="search-row">
            <Avatar {...avatarOf(item)} size="sm" />
            <span className="search-row-text">
              <span className="ellipsis" dir="auto">
                {item.displayName}
              </span>
              {item.handle && <span className="search-row-meta ellipsis">@{item.handle}</span>}
            </span>
            {item.certified && <span className="actor-picker-tag">Certified</span>}
          </span>
        </ComboboxOption>
      )}
    />
  );
}
