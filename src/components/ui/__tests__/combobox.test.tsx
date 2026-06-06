import React, { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Combobox, { type ComboboxOptionRenderProps } from "../combobox";

afterEach(() => {
  cleanup();
});

/**
 * jsdom doesn't implement scrollIntoView; the combobox calls it on the
 * highlighted row during keyboard nav. Stub it so those code paths run.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

interface Item {
  id: string;
  label: string;
}

const ITEMS: Item[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo" },
  { id: "c", label: "Charlie" },
];

interface HarnessProps {
  items?: Item[];
  isLoading?: boolean;
  onSelect?: (item: Item, index: number) => void;
  onSubmitNoMatch?: (raw: string) => void;
  onSubmit?: (raw: string) => void;
  escapeStage?: "two-stage" | "close-only";
  enableHomeEnd?: boolean;
  withLiveStatus?: boolean;
}

/**
 * Thin controlled wrapper — the combobox is controlled-items, so the
 * harness owns `value` / `open` and feeds a fixed list. Lets the tests
 * drive the keyboard + assert ARIA without a real data layer.
 */
function Harness({
  items = ITEMS,
  isLoading = false,
  onSelect = () => undefined,
  onSubmitNoMatch,
  onSubmit,
  escapeStage = "two-stage",
  enableHomeEnd = true,
  withLiveStatus = false,
}: HarnessProps) {
  const [value, setValue] = useState("a");
  const [open, setOpen] = useState(true);
  return (
    <Combobox<Item>
      value={value}
      onValueChange={setValue}
      items={items}
      getItemKey={(it) => it.id}
      isLoading={isLoading}
      open={open}
      onOpenChange={setOpen}
      onSelect={onSelect}
      onSubmitNoMatch={onSubmitNoMatch}
      onSubmit={onSubmit}
      escapeStage={escapeStage}
      enableHomeEnd={enableHomeEnd}
      inputProps={{ "aria-label": "Search", placeholder: "Search" }}
      liveStatus={
        withLiveStatus
          ? {
              searching: "Searching",
              results: (n) => `${n} results`,
              empty: "No results",
            }
          : undefined
      }
      renderEmpty={() => <li className="empty">No results.</li>}
      renderOption={({
        item,
        highlighted,
        optionId,
        onHover,
        onSelect: selectRow,
      }: ComboboxOptionRenderProps<Item>) => (
        <li
          id={optionId}
          role="option"
          aria-selected={highlighted}
          data-combobox-option
          data-highlighted={highlighted}
          onMouseEnter={onHover}
          onMouseDown={selectRow}
        >
          {item.label}
        </li>
      )}
    />
  );
}

function getInput() {
  return screen.getByRole("combobox") as HTMLInputElement;
}

function highlightedLabel(): string | null {
  const el = document.querySelector('[data-combobox-option][data-highlighted="true"]');
  return el ? el.textContent : null;
}

describe("Combobox — ARIA", () => {
  it("wires the combobox/listbox ARIA contract", () => {
    render(<Harness />);
    const input = getInput();
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("true");

    const listbox = screen.getByRole("listbox");
    const controls = input.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(listbox.getAttribute("id")).toBe(controls);
  });

  it("points aria-activedescendant at the highlighted option's id", () => {
    render(<Harness />);
    const input = getInput();
    // First row is highlighted on mount (items non-empty → index 0).
    const active = input.getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    const firstOption = screen.getAllByRole("option")[0];
    expect(firstOption.getAttribute("id")).toBe(active);
  });

  it("sets aria-busy on the listbox while loading", () => {
    render(<Harness isLoading />);
    expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("true");
  });

  it("announces the live status from liveStatus", () => {
    render(<Harness withLiveStatus />);
    // Not loading, 3 items → "3 results".
    const region = document.querySelector('[aria-live="polite"]');
    expect(region?.textContent).toBe("3 results");
  });
});

describe("Combobox — keyboard", () => {
  it("highlights the first item when items are non-empty", () => {
    render(<Harness />);
    expect(highlightedLabel()).toBe("Alpha");
  });

  it("ArrowDown moves the highlight and wraps at the end", () => {
    render(<Harness />);
    const input = getInput();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(highlightedLabel()).toBe("Bravo");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(highlightedLabel()).toBe("Charlie");
    // Wrap back to the first item.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(highlightedLabel()).toBe("Alpha");
  });

  it("ArrowUp wraps to the last item from the first", () => {
    render(<Harness />);
    const input = getInput();
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(highlightedLabel()).toBe("Charlie");
  });

  it("Home/End jump to the first/last item", () => {
    render(<Harness />);
    const input = getInput();
    fireEvent.keyDown(input, { key: "End" });
    expect(highlightedLabel()).toBe("Charlie");
    fireEvent.keyDown(input, { key: "Home" });
    expect(highlightedLabel()).toBe("Alpha");
  });

  it("does not move on Home/End when enableHomeEnd is false", () => {
    render(<Harness enableHomeEnd={false} />);
    const input = getInput();
    fireEvent.keyDown(input, { key: "End" });
    expect(highlightedLabel()).toBe("Alpha");
  });

  it("Enter selects the highlighted item", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = getInput();
    fireEvent.keyDown(input, { key: "ArrowDown" }); // highlight Bravo
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toEqual({ id: "b", label: "Bravo" });
    expect(onSelect.mock.calls[0][1]).toBe(1);
  });

  it("Enter falls back to the first item when nothing is explicitly highlighted but items exist", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    // Highlight defaults to 0 on mount, so Enter selects the first item.
    fireEvent.keyDown(getInput(), { key: "Enter" });
    expect(onSelect.mock.calls[0][1]).toBe(0);
  });

  it("Enter calls onSubmitNoMatch with the raw value when the list is empty", () => {
    const onSelect = vi.fn();
    const onSubmitNoMatch = vi.fn();
    render(
      <Harness items={[]} onSelect={onSelect} onSubmitNoMatch={onSubmitNoMatch} />,
    );
    // Empty list → no listbox options. Type into the input then Enter.
    const input = getInput();
    fireEvent.change(input, { target: { value: "alice.social" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onSubmitNoMatch).toHaveBeenCalledWith("alice.social");
  });

  it("Enter calls onSubmit with the trimmed value, taking precedence over row selection", () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn();
    render(<Harness onSelect={onSelect} onSubmit={onSubmit} />);
    const input = getInput();
    // A row is highlighted (index 0 on mount), but onSubmit wins.
    fireEvent.change(input, { target: { value: "  climate  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith("climate");
  });

  it("does not call onSubmit when the typed value is empty", () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn();
    render(<Harness onSelect={onSelect} onSubmit={onSubmit} />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    // Falls back to the normal commit path (first row highlighted).
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("mouse selecting a row fires onSelect with that item + index", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const charlie = screen.getByText("Charlie");
    fireEvent.mouseDown(charlie);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toEqual({ id: "c", label: "Charlie" });
    expect(onSelect.mock.calls[0][1]).toBe(2);
  });

  it("hovering a row moves the highlight to it", () => {
    render(<Harness />);
    fireEvent.mouseEnter(screen.getByText("Charlie"));
    expect(highlightedLabel()).toBe("Charlie");
  });
});

describe("Combobox — Escape", () => {
  it("two-stage: first Escape closes the listbox, second clears the value", () => {
    render(<Harness escapeStage="two-stage" />);
    const input = getInput();
    expect(input.getAttribute("aria-expanded")).toBe("true");

    // First Escape — close.
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect((getInput() as HTMLInputElement).value).toBe("a");

    // Second Escape (already closed) — clear the value.
    fireEvent.keyDown(getInput(), { key: "Escape" });
    expect((getInput() as HTMLInputElement).value).toBe("");
  });

  it("close-only: Escape closes but never clears the value", () => {
    render(<Harness escapeStage="close-only" />);
    const input = getInput();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(getInput().getAttribute("aria-expanded")).toBe("false");
    // Second Escape must be a no-op for the value.
    fireEvent.keyDown(getInput(), { key: "Escape" });
    expect((getInput() as HTMLInputElement).value).toBe("a");
  });
});

describe("Combobox — empty state", () => {
  it("renders the empty node inside the listbox when open with no items but a typed value", () => {
    function EmptyHarness() {
      const [open] = useState(true);
      return (
        <Combobox<Item>
          value="zzz"
          onValueChange={() => undefined}
          items={[]}
          getItemKey={(it) => it.id}
          open={open}
          onOpenChange={() => undefined}
          onSelect={() => undefined}
          inputProps={{ "aria-label": "Search" }}
          renderEmpty={() => <li className="empty">No results.</li>}
          renderOption={() => null}
        />
      );
    }
    render(<EmptyHarness />);
    expect(screen.getByRole("listbox").textContent).toContain("No results.");
  });
});
