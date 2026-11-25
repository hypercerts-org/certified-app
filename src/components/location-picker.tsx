"use client";

// Where a record's work happens, chosen in a dialog, after v1's picker:
// "My locations", the places the account already published, to use again;
// or "New": search for a place by name, or click the map to drop a pin (and
// drag it), then name it. Searching waits until typing pauses (from three
// characters); places come from Nominatim through /api/places. Nothing is
// written here: the choice goes into the form, and the record is written
// with what it's for.

import {
  Button,
  Combobox,
  ComboboxOption,
  ErrorMessage,
  Field,
  Input,
  Radio,
  ResponsiveDialog,
  SegmentedControl,
  Text,
} from "@hypercerts-org/ui-react";
import { MapPin, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LocationMap } from "@/components/location-map";
import type { SavedPlace } from "@/lib/hypercerts/queries";
import { LOCATION_NAME_MAX, type LocationChoice, type Point } from "@/lib/location-choice";

type PlaceHit = { id: string; name: string; lat: number; lng: number };

/** How long typing must pause before a search, in milliseconds. */
const SEARCH_PAUSE = 500;

/** A location field: the chosen place, with Change and Remove; or Add location. */
export function LocationField({
  label,
  value,
  onChange,
  saved,
  error,
}: {
  label: string;
  value: LocationChoice | null;
  onChange: (next: LocationChoice | null) => void;
  /** The account's published places, for "My locations". */
  saved: SavedPlace[];
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="location-field">
      <span className="record-form-legend">{label}</span>
      {value ? (
        <div className="location-field-chosen">
          <p className="location-name">
            <MapPin size={16} aria-hidden />
            <span dir="auto">{value.name}</span>
          </p>
          <div className="location-field-actions">
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              <Pencil size={16} aria-hidden />
              Change
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onChange(null)}>
              <X size={16} aria-hidden />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)} className="location-field-add">
          <MapPin size={16} aria-hidden />
          Add location
        </Button>
      )}
      {error && <ErrorMessage live>{error}</ErrorMessage>}
      {open && (
        <LocationPicker
          saved={saved}
          initial={value}
          onClose={() => setOpen(false)}
          onPick={(choice) => {
            onChange(choice);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function LocationPicker({
  saved,
  initial,
  onClose,
  onPick,
}: {
  saved: SavedPlace[];
  initial: LocationChoice | null;
  onClose: () => void;
  onPick: (choice: LocationChoice) => void;
}) {
  const [mode, setMode] = useState<"saved" | "new">(
    saved.length > 0 && initial?.kind !== "new" ? "saved" : "new",
  );
  const [savedUri, setSavedUri] = useState(initial?.kind === "saved" ? initial.uri : "");
  const [point, setPoint] = useState<Point | null>(initial?.kind === "new" ? initial.point : null);
  const [name, setName] = useState(initial?.kind === "new" ? initial.name : "");
  const chosenSaved = saved.find((place) => place.uri === savedUri);

  const ready = mode === "saved" ? Boolean(chosenSaved) : Boolean(point && name.trim());
  const use = () => {
    if (mode === "saved" && chosenSaved) {
      onPick({
        kind: "saved",
        uri: chosenSaved.uri,
        name: chosenSaved.name,
        point: chosenSaved.point,
      });
    } else if (mode === "new" && point && name.trim()) {
      onPick({ kind: "new", name: name.trim(), point });
    }
  };

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      title="Add a location"
      description="Where the work happens."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} onClick={use}>
            Use this location
          </Button>
        </>
      }
    >
      <div className="location-picker">
        {saved.length > 0 && (
          <SegmentedControl
            label="Where the location comes from"
            options={[
              { value: "saved", label: "My locations" },
              { value: "new", label: "New" },
            ]}
            value={mode}
            onChange={(next) => setMode(next as "saved" | "new")}
          />
        )}
        {mode === "saved" ? (
          <>
            <fieldset className="location-picker-saved">
              <legend className="visually-hidden">Your locations</legend>
              {saved.map((place) => (
                <Radio
                  key={place.uri}
                  name="saved-location"
                  label={place.name}
                  checked={savedUri === place.uri}
                  onChange={() => setSavedUri(place.uri)}
                />
              ))}
            </fieldset>
            {chosenSaved?.point && (
              <LocationMap point={chosenSaved.point} label={chosenSaved.name} imageUrl={null} />
            )}
          </>
        ) : (
          <NewPlace point={point} name={name} onPoint={setPoint} onName={setName} />
        )}
      </div>
    </ResponsiveDialog>
  );
}

/** "New": search a place, or click the map; then its name, to change if need be. */
function NewPlace({
  point,
  name,
  onPoint,
  onName,
}: {
  point: Point | null;
  name: string;
  onPoint: (point: Point) => void;
  onName: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [naming, setNaming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Search once typing pauses; a newer query cancels the older one.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/places?${new URLSearchParams({ q })}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { places: Omit<PlaceHit, "id">[] };
        setHits(body.places.map((place, i) => ({ ...place, id: `place-${i}` })));
        setProblem(null);
      } catch {
        if (!controller.signal.aborted) {
          setProblem("Places can't be searched right now. Click the map instead.");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_PAUSE);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const choose = (hit: PlaceHit) => {
    onPoint({ lat: hit.lat, lng: hit.lng });
    onName(hit.name.slice(0, LOCATION_NAME_MAX));
    setQuery(hit.name);
    setOpen(false);
  };

  // A dropped pin is named after what is there; the name can be changed.
  const drop = async (at: Point) => {
    const next = { lat: round(at.lat), lng: round(at.lng) };
    onPoint(next);
    setNaming(true);
    try {
      const response = await fetch(
        `/api/places?${new URLSearchParams({ lat: String(next.lat), lng: String(next.lng) })}`,
      );
      const body = response.ok ? ((await response.json()) as { name: string | null }) : null;
      onName((body?.name ?? `${next.lat}, ${next.lng}`).slice(0, LOCATION_NAME_MAX));
    } finally {
      setNaming(false);
    }
  };

  return (
    <>
      <Combobox
        label="Search for a place"
        placeholder="A town, a region, an address…"
        value={query}
        onValueChange={(next) => {
          setQuery(next);
          setOpen(true);
        }}
        items={hits}
        open={open && query.trim().length >= 3}
        onOpenChange={setOpen}
        loading={searching}
        emptyMessage="No places found."
        escapeStage="close-only"
        onSelect={choose}
        renderItem={({ item, ...option }) => {
          const [first, ...rest] = item.name.split(", ");
          return (
            <ComboboxOption key={item.id} {...option}>
              <span className="location-hit">
                <span className="location-hit-name">{first}</span>
                {rest.length > 0 && <span className="location-hit-where">{rest.join(", ")}</span>}
              </span>
            </ComboboxOption>
          );
        }}
      />
      {problem && (
        <Text size="body-sm" tone="muted">
          {problem}
        </Text>
      )}
      <LocationMap point={point} label={name || "The chosen place"} imageUrl={null} onPick={drop} />
      <Text size="body-sm" tone="muted">
        {point
          ? `Pinned at ${point.lat}, ${point.lng}. Drag the pin, or click elsewhere, to move it.`
          : "Or click the map to drop a pin."}
      </Text>
      {point && (
        <Field
          label="Name"
          description="How the place is shown. Change it to something more specific if you like."
        >
          {(props) => (
            <Input
              {...props}
              value={naming ? "Finding the name…" : name}
              disabled={naming}
              maxLength={LOCATION_NAME_MAX}
              onChange={(event) => onName(event.target.value)}
            />
          )}
        </Field>
      )}
    </>
  );
}

/** Four decimals: about 11 m, finer than a pin dropped by hand. */
const round = (value: number) => Math.round(value * 10_000) / 10_000;
