"use client";

import { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import {
  Search,
  X,
  Inbox,
  Star,
  List,
  LayoutGrid,
  Check,
} from "lucide-react";

import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Avatar from "@/components/ui/avatar";
import Banner from "@/components/ui/banner";
import Switch from "@/components/ui/switch";
import Checkbox from "@/components/ui/checkbox";
import { RadioGroup, Radio } from "@/components/ui/radio";
import Select from "@/components/ui/select";
import Input from "@/components/ui/input";
import Textarea from "@/components/ui/textarea";
import EmptyState from "@/components/ui/empty-state";
import Skeleton from "@/components/ui/skeleton";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ErrorMessage from "@/components/ui/error-message";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs";
import Combobox from "@/components/ui/combobox";
import SegmentedControl, { ToggleGroup } from "@/components/ui/segmented-control";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverItem,
} from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";
import AppDialog, { AppDialogHeader, AppDialogBody } from "@/components/ui/app-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import FormDialog from "@/components/ui/form-dialog";
import BottomSheet from "@/components/ui/bottom-sheet";
import Drawer from "@/components/ui/drawer";
import ResponsiveDialog from "@/components/ui/responsive-dialog";
import Brandmark from "@/components/ui/brandmark";
import ThemeToggle from "@/components/ui/theme-toggle";
import CertIcon from "@/components/ui/cert-icon";
import IdentityRow from "@/components/ui/identity-row";
import SmartLink from "@/components/ui/smart-link";
import FeedLabelPill from "@/components/ui/feed-label-pill";
import Pagination from "@/components/ui/pagination";
import LoadMoreSentinel from "@/components/ui/load-more-sentinel";
import EditBanner from "@/components/ui/edit-banner";
import DeleteRecordDialog from "@/components/ui/delete-record-dialog";
import SignInModal from "@/components/ui/sign-in-modal";
import { useFeedback } from "@/lib/feedback-context";

/* -------------------------------------------------------------------------- *
 * Layout helpers (gallery-local; not part of the design system).             *
 * -------------------------------------------------------------------------- */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6 border-t border-[var(--border-subtle)] pt-8">
      <h2 className="font-headline text-h3 text-[var(--fg-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption uppercase tracking-wider text-[var(--fg-muted)]">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * Live, dev-only component gallery.                                          *
 *                                                                            *
 * Renders every primitive from @/components/ui/* with its variants + states  *
 * in a single centered column on --bg-canvas, so a screenshot tool can crawl *
 * it for visual verification. Gated to non-production via notFound().        *
 * -------------------------------------------------------------------------- */

export default function GalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();

  // Interactive state for the controllable primitives.
  const [tab, setTab] = useState("overview");
  const [segTab, setSegTab] = useState("day");
  const [linkTab, setLinkTab] = useState("posts");
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("a");
  const [comboValue, setComboValue] = useState("acme");
  const [trailingValue, setTrailingValue] = useState("clearable text");

  // NEW primitives — local-only state for the live demos below.
  const [typeahead, setTypeahead] = useState("a");
  const [typeaheadOpen, setTypeaheadOpen] = useState(true);
  const [iconView, setIconView] = useState("list");
  const [pillView, setPillView] = useState("week");
  const [responses, setResponses] = useState<string[]>(["accept"]);

  // Overlay open-flags.
  const [appDialogOpen, setAppDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [responsiveOpen, setResponsiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  // Pagination — interactive 1-based page within a 5-page range.
  const [pageNum, setPageNum] = useState(2);
  // LoadMoreSentinel — flips to a loading state on click (reset shortly after,
  // so the demo doesn't get stuck spinning).
  const [loadingMore, setLoadingMore] = useState(false);

  const { toast } = useToast();
  const { openFeedback } = useFeedback();

  // Static mock list for the working Combobox typeahead; filtered by the
  // typed value (case-insensitive substring). Local-only — no fetch.
  const TYPEAHEAD_ITEMS = useMemo(
    () => [
      { id: "ada", name: "Ada Lovelace", handle: "@ada" },
      { id: "alan", name: "Alan Turing", handle: "@alan" },
      { id: "grace", name: "Grace Hopper", handle: "@grace" },
      { id: "katherine", name: "Katherine Johnson", handle: "@katherine" },
      { id: "linus", name: "Linus Torvalds", handle: "@linus" },
    ],
    [],
  );
  const typeaheadResults = useMemo(() => {
    const q = typeahead.trim().toLowerCase();
    if (!q) return TYPEAHEAD_ITEMS;
    return TYPEAHEAD_ITEMS.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.handle.toLowerCase().includes(q),
    );
  }, [typeahead, TYPEAHEAD_ITEMS]);

  return (
    <div className="min-h-screen w-full bg-[var(--bg-canvas)] px-6 py-12">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-12">
        <header className="flex flex-col gap-2">
          <h1 className="font-headline text-h1 text-[var(--fg-primary)]">
            Component gallery
          </h1>
          <p className="text-body text-[var(--fg-secondary)]">
            Live render of every <code>@/components/ui/*</code> primitive with
            its variants and states. Dev-only.
          </p>
        </header>

        {/* ================================================================ */}
        {/* CORE INTERACTIVE                                                 */}
        {/* ================================================================ */}
        <Section title="Core interactive">
          <Row label="Button — variants">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </Row>

          <Row label="Button — sizes">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Star">
              <Star className="h-4 w-4" />
            </Button>
          </Row>

          <Row label="Button — loading + disabled">
            <Button loading>Saving</Button>
            <Button variant="secondary" loading>
              Loading
            </Button>
            <Button disabled>Disabled</Button>
            <Button size="icon" aria-label="Loading icon" loading>
              <Star className="h-4 w-4" />
            </Button>
          </Row>

          {/* NEW STATE: pressed toggle for secondary + ghost, on/off side by side. */}
          <Row label="Button — pressed (NEW: secondary + ghost, false vs true)">
            <Button variant="secondary" pressed={false}>
              Secondary off
            </Button>
            <Button variant="secondary" pressed>
              Secondary on
            </Button>
            <Button variant="ghost" pressed={false}>
              Ghost off
            </Button>
            <Button variant="ghost" pressed>
              Ghost on
            </Button>
          </Row>

          <Row label="Switch">
            <Switch
              checked={switchOn}
              onCheckedChange={setSwitchOn}
              label="Notifications"
            />
            <Switch checked={false} onCheckedChange={() => {}} aria-label="Off" />
            <Switch
              checked
              disabled
              onCheckedChange={() => {}}
              aria-label="Disabled on"
            />
          </Row>

          <Row label="Checkbox">
            <Checkbox
              label="Checked"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <Checkbox label="Unchecked" checked={false} onChange={() => {}} />
            <Checkbox label="Indeterminate" indeterminate onChange={() => {}} />
            <Checkbox label="Disabled" disabled onChange={() => {}} />
            <Checkbox
              label="With error"
              error="This field is required"
              onChange={() => {}}
            />
          </Row>

          <Row label="Radio group">
            <RadioGroup
              value={radio}
              onValueChange={setRadio}
              aria-label="Demo radio group"
              className="flex gap-4"
            >
              <Radio value="a">Option A</Radio>
              <Radio value="b">Option B</Radio>
              <Radio value="c" disabled>
                Disabled
              </Radio>
            </RadioGroup>
          </Row>
        </Section>

        {/* ================================================================ */}
        {/* FORM FIELDS                                                      */}
        {/* ================================================================ */}
        <Section title="Form fields">
          <Row label="Input — variants + sizes">
            <div className="flex w-full flex-col gap-3">
              <Input label="Default" placeholder="Default field" />
              <Input
                variant="underline"
                placeholder="Underline variant"
                aria-label="Underline"
              />
              <Input
                variant="inline-edit"
                defaultValue="Inline-edit variant"
                aria-label="Inline edit"
              />
              <Input size="sm" placeholder="Small" aria-label="Small" />
              <Input size="lg" placeholder="Large" aria-label="Large" />
              <Input label="Disabled" disabled placeholder="Disabled" />
              <Input
                label="With error"
                error="That doesn't look right"
                defaultValue="oops"
              />
              <Input
                label="With helper text"
                helperText="We'll never share this."
                placeholder="you@example.com"
              />
              <Input
                leadingIcon={<Search className="h-4 w-4" />}
                placeholder="Search with leading icon"
                aria-label="Search"
              />
            </div>
          </Row>

          {/* NEW STATE: Input trailingButton (interactive) + combobox example. */}
          <Row label="Input — trailingButton + combobox (NEW)">
            <div className="flex w-full flex-col gap-3">
              <Input
                aria-label="Clearable input"
                value={trailingValue}
                onChange={(e) => setTrailingValue(e.target.value)}
                placeholder="Type to clear"
                data-testid="input-trailing-button-field"
                trailingButton={
                  <button
                    type="button"
                    aria-label="Clear input"
                    data-testid="input-clear-button"
                    onClick={() => setTrailingValue("")}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--fg-muted)] transition-colors duration-150 hover:bg-[var(--overlay-weak)] hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 motion-reduce:transition-none"
                  >
                    <X className="h-4 w-4" />
                  </button>
                }
              />
              {/* Combobox-style: leading search glyph + an interactive trailing
                  submit button wired to the field, backed by a popover list. */}
              <Popover>
                <PopoverTrigger>
                  <div className="w-full" data-testid="combobox-trigger">
                    <Input
                      aria-label="Organization combobox"
                      role="combobox"
                      aria-expanded={false}
                      value={comboValue}
                      onChange={(e) => setComboValue(e.target.value)}
                      leadingIcon={<Search className="h-4 w-4" />}
                      placeholder="Find an organization"
                      trailingButton={
                        <button
                          type="button"
                          aria-label="Open suggestions"
                          className="inline-flex h-6 items-center rounded px-1.5 text-caption font-semibold uppercase tracking-wider text-[var(--fg-muted)] transition-colors duration-150 hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 motion-reduce:transition-none"
                        >
                          Go
                        </button>
                      }
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent align="start" minWidth={260}>
                  <PopoverItem onClick={() => setComboValue("acme")}>
                    Acme Corp
                  </PopoverItem>
                  <PopoverItem onClick={() => setComboValue("globex")}>
                    Globex
                  </PopoverItem>
                  <PopoverItem onClick={() => setComboValue("initech")}>
                    Initech
                  </PopoverItem>
                </PopoverContent>
              </Popover>
            </div>
          </Row>

          <Row label="Textarea">
            <div className="flex w-full flex-col gap-3">
              <Textarea label="Default" placeholder="Write something…" />
              <Textarea
                variant="underline"
                placeholder="Underline variant"
                aria-label="Underline textarea"
              />
              <Textarea
                label="With counter"
                showCount
                maxLength={120}
                defaultValue="Counting characters"
              />
              <Textarea
                label="With error"
                error="Too short"
                defaultValue="hi"
              />
              <Textarea label="Disabled" disabled placeholder="Disabled" />
            </div>
          </Row>

          <Row label="Select">
            <div className="flex w-full flex-col gap-3">
              <Select label="Default" defaultValue="b">
                <option value="a">First option</option>
                <option value="b">Second option</option>
                <option value="c">Third option</option>
              </Select>
              <Select label="Disabled" disabled defaultValue="a">
                <option value="a">Locked</option>
              </Select>
              <Select label="With error" error="Pick one" defaultValue="">
                <option value="">Choose…</option>
                <option value="a">First option</option>
              </Select>
            </div>
          </Row>
        </Section>

        {/* ================================================================ */}
        {/* SURFACES                                                         */}
        {/* ================================================================ */}
        <Section title="Surfaces">
          <Row label="Card — variants">
            <div className="flex w-full flex-col gap-3">
              <Card variant="elevated">Elevated card</Card>
              <Card variant="inset">Inset card</Card>
              <Card variant="row">Row card (divider)</Card>
              <Card variant="elevated" hoverable>
                Elevated, hoverable
              </Card>
            </div>
          </Row>

          <Row label="Avatar — sizes + fallback">
            <Avatar size="sm" fallbackInitials="AB" />
            <Avatar size="md" fallbackInitials="CD" />
            <Avatar size="lg" fallbackInitials="EF" />
            <Avatar size="xl" fallbackInitials="GH" />
            <Avatar size="md" fallbackInitials="IJ" bordered />
          </Row>
        </Section>

        {/* ================================================================ */}
        {/* STATUS & FEEDBACK                                                */}
        {/* ================================================================ */}
        <Section title="Status & feedback">
          <Row label="Badge — status">
            <Badge variant="verified">Verified</Badge>
            <Badge variant="pending">Pending</Badge>
            <Badge variant="unverified">Unverified</Badge>
          </Row>

          <Row label="Badge — chips + quality">
            <Badge variant="tag">Tag</Badge>
            <Badge variant="role">Admin</Badge>
            <Badge variant="high-quality">High quality</Badge>
            <Badge variant="standard">Standard</Badge>
            <Badge variant="draft">Draft</Badge>
            <Badge variant="test">Test</Badge>
          </Row>

          {/* NEW STATE: count tone="neutral" + the bare count style. */}
          <Row label="Badge — counts (NEW: tone=neutral + count-bare)">
            <Badge variant="count">12</Badge>
            <Badge variant="count" tone="neutral">
              12
            </Badge>
            <span className="inline-flex items-center gap-1 text-body-sm text-[var(--fg-secondary)]">
              Members
              <Badge variant="count-bare">128</Badge>
            </span>
          </Row>

          <Row label="Banner — variants">
            <div className="flex w-full flex-col gap-3">
              <Banner variant="info" title="Heads up">
                This is an informational banner.
              </Banner>
              <Banner variant="success" title="All set">
                Your changes were saved.
              </Banner>
              <Banner variant="warning" title="Careful">
                This action can&apos;t be undone.
              </Banner>
              <Banner
                variant="error"
                title="Something failed"
                onDismiss={() => {}}
              >
                We couldn&apos;t reach the server. Dismissable.
              </Banner>
            </div>
          </Row>

          <Row label="ErrorMessage">
            <div className="w-full">
              <ErrorMessage
                message="The request timed out. Please try again."
                onRetry={() => {}}
              />
            </div>
          </Row>

          {/* NEW STATE: EmptyState inline / compact variants. */}
          <Row label="EmptyState — rich / inline / compact (NEW inline + compact)">
            <div className="flex w-full flex-col gap-4">
              <Card variant="inset">
                <EmptyState
                  icon={Inbox}
                  title="No certificates yet"
                  description="Certificates you create will show up here."
                >
                  <Button size="sm">Create one</Button>
                </EmptyState>
              </Card>
              <EmptyState
                variant="inline"
                title="No members in this group."
              >
                <a
                  href="#"
                  className="text-[var(--fg-primary)] underline underline-offset-2"
                  onClick={(e) => e.preventDefault()}
                >
                  Invite one
                </a>
              </EmptyState>
              <EmptyState
                variant="compact"
                title="Nothing here yet."
                description="(compact alias)"
              />
            </div>
          </Row>

          <Row label="LoadingSpinner — sizes">
            <LoadingSpinner size="sm" />
            <LoadingSpinner size="md" />
            <LoadingSpinner size="lg" />
          </Row>

          <Row label="Skeleton — variants">
            <div className="flex w-full flex-col gap-3">
              <Skeleton variant="line" width="60%" />
              <Skeleton variant="box" height={80} />
              <Skeleton variant="text" lines={3} />
              <Skeleton variant="circle" />
            </div>
          </Row>

          {/* NEW STATE: animate={false} circle inside a flex row. */}
          <Row label="Skeleton — static circle in a flex row (NEW animate=false)">
            <div className="flex items-center gap-3">
              <Skeleton circle animate={false} width={40} />
              <div className="flex flex-col gap-2">
                <Skeleton variant="line" width={160} animate={false} />
                <Skeleton variant="line" width={100} animate={false} />
              </div>
            </div>
          </Row>
        </Section>

        {/* ================================================================ */}
        {/* NAVIGATION                                                       */}
        {/* ================================================================ */}
        <Section title="Navigation">
          <Row label="Tabs — underline (interactive)">
            <div className="w-full" data-testid="tabs-demo">
              <Tabs value={tab} onChange={setTab}>
                <TabList aria-label="Underline tabs demo">
                  <Tab value="overview" data-testid="tabs-demo-overview">
                    Overview
                  </Tab>
                  <Tab value="activity" count={3}>
                    Activity
                  </Tab>
                  <Tab value="settings" data-testid="tabs-demo-settings">
                    Settings
                  </Tab>
                  <Tab value="disabled" disabled>
                    Disabled
                  </Tab>
                </TabList>
                <TabPanel value="overview" className="pt-4 text-body text-[var(--fg-secondary)]">
                  Overview panel content.
                </TabPanel>
                <TabPanel value="activity" className="pt-4 text-body text-[var(--fg-secondary)]">
                  Activity panel content.
                </TabPanel>
                <TabPanel value="settings" className="pt-4 text-body text-[var(--fg-secondary)]">
                  Settings panel content.
                </TabPanel>
              </Tabs>
            </div>
          </Row>

          {/* NEW STATE: segmented variant. */}
          <Row label="Tabs — segmented (NEW variant)">
            <div className="w-full" data-testid="tabs-segmented">
              <Tabs value={segTab} onChange={setSegTab} variant="segmented">
                <TabList aria-label="Segmented tabs demo">
                  <Tab value="day">Day</Tab>
                  <Tab value="week">Week</Tab>
                  <Tab value="month">Month</Tab>
                </TabList>
                <TabPanel value="day" className="pt-4 text-body text-[var(--fg-secondary)]">
                  Day view.
                </TabPanel>
                <TabPanel value="week" className="pt-4 text-body text-[var(--fg-secondary)]">
                  Week view.
                </TabPanel>
                <TabPanel value="month" className="pt-4 text-body text-[var(--fg-secondary)]">
                  Month view.
                </TabPanel>
              </Tabs>
            </div>
          </Row>

          {/* NEW STATE: link tabs (href). */}
          <Row label="Tabs — link tabs (NEW href, rendered as anchors)">
            <div className="w-full" data-testid="tabs-link">
              <Tabs value={linkTab} onChange={setLinkTab}>
                <TabList aria-label="Link tabs demo">
                  <Tab value="posts" href="/dev/gallery?tab=posts">
                    Posts
                  </Tab>
                  <Tab value="replies" href="/dev/gallery?tab=replies">
                    Replies
                  </Tab>
                  <Tab value="likes" href="/dev/gallery?tab=likes" count={9}>
                    Likes
                  </Tab>
                </TabList>
              </Tabs>
            </div>
          </Row>
        </Section>

        {/* ================================================================ */}
        {/* NEW PRIMITIVES                                                   */}
        {/* ================================================================ */}
        <Section title="New primitives">
          {/* ----- Combobox: working typeahead -------------------------- */}
          <Row label="Combobox — working typeahead (NEW: open with results)">
            <div className="w-full max-w-[360px]" data-testid="combobox-demo">
              <Combobox
                value={typeahead}
                onValueChange={(next) => {
                  setTypeahead(next);
                  setTypeaheadOpen(true);
                }}
                items={typeaheadResults}
                getItemKey={(item) => item.id}
                open={typeaheadOpen}
                onOpenChange={setTypeaheadOpen}
                onSelect={(item) => {
                  setTypeahead(item.name);
                  setTypeaheadOpen(false);
                }}
                role="search"
                inputProps={{
                  "aria-label": "Search people",
                  placeholder: "Search people",
                  leadingIcon: <Search className="h-4 w-4" />,
                }}
                trailingButton={
                  typeahead ? (
                    <button
                      type="button"
                      aria-label="Clear search"
                      data-testid="combobox-clear"
                      onClick={() => {
                        setTypeahead("");
                        setTypeaheadOpen(true);
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--fg-muted)] transition-colors duration-150 hover:bg-[var(--overlay-weak)] hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 motion-reduce:transition-none"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null
                }
                listboxClassName="mt-1 max-h-64 overflow-auto rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1 shadow-md"
                renderEmpty={() => (
                  <li
                    role="presentation"
                    className="px-3 py-2 text-body-sm text-[var(--fg-muted)]"
                  >
                    No matches.
                  </li>
                )}
                renderOption={({
                  item,
                  highlighted,
                  optionId,
                  onHover,
                  onSelect,
                }) => (
                  <li
                    role="option"
                    id={optionId}
                    data-combobox-option
                    aria-selected={highlighted}
                    data-testid={`combobox-option-${item.id}`}
                    onMouseEnter={onHover}
                    onMouseDown={onSelect}
                    className={`flex cursor-pointer items-center justify-between rounded px-3 py-2 text-body-sm ${
                      highlighted
                        ? "bg-[var(--overlay-weak)] text-[var(--fg-primary)]"
                        : "text-[var(--fg-secondary)]"
                    }`}
                  >
                    <span className="text-[var(--fg-primary)]">{item.name}</span>
                    <span className="text-[var(--fg-muted)]">{item.handle}</span>
                  </li>
                )}
              />
            </div>
          </Row>

          {/* ----- SegmentedControl: single-select --------------------- */}
          <Row label="SegmentedControl — icon-only joined square (md)">
            <SegmentedControl
              aria-label="View mode"
              value={iconView}
              onValueChange={setIconView}
              size="md"
              joined
              shape="square"
              iconOnly
              options={[
                {
                  value: "list",
                  icon: <List size={16} />,
                  ariaLabel: "List view",
                },
                {
                  value: "gallery",
                  icon: <LayoutGrid size={16} />,
                  ariaLabel: "Gallery view",
                },
              ]}
            />
            <span
              className="text-body-sm text-[var(--fg-muted)]"
              data-testid="segmented-icon-value"
            >
              {iconView}
            </span>
          </Row>

          <Row label="SegmentedControl — text pills (joined=false, shape=pill)">
            <SegmentedControl
              aria-label="Date range"
              value={pillView}
              onValueChange={setPillView}
              joined={false}
              shape="pill"
              options={[
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
              ]}
            />
          </Row>

          {/* ----- ToggleGroup: multi-select with tone variants -------- */}
          <Row label="ToggleGroup — multi-select tones (neutral / success / warn)">
            <div
              className="flex flex-wrap items-center gap-4"
              data-testid="toggle-group-demo"
            >
              {/* Color-coded accept (green) / reject (amber) pair — both
                  togglable, multi-select (either, both, or neither). */}
              <ToggleGroup
                aria-label="Response"
                value={responses}
                onValueChange={setResponses}
                shape="pill"
                joined={false}
                options={[
                  {
                    value: "accept",
                    label: "Accept",
                    tone: "success",
                    icon: <Check size={14} />,
                  },
                  {
                    value: "reject",
                    label: "Reject",
                    tone: "warn",
                    icon: <X size={14} />,
                  },
                ]}
              />
              {/* A joined neutral-tone multi-select for contrast. */}
              <ToggleGroup
                aria-label="Text formatting"
                value={responses.filter((v) => v === "bold" || v === "italic")}
                onValueChange={(next) =>
                  setResponses((prev) => [
                    ...prev.filter((v) => v !== "bold" && v !== "italic"),
                    ...next,
                  ])
                }
                tone="neutral"
                joined
                shape="square"
                options={[
                  { value: "bold", label: "Bold" },
                  { value: "italic", label: "Italic" },
                ]}
              />
            </div>
          </Row>

          {/* ----- Popover portal -------------------------------------- */}
          <Row label="Popover — portal + side/align (NEW)">
            <Popover>
              <PopoverTrigger>
                <Button
                  variant="secondary"
                  data-testid="open-popover-portal"
                >
                  Open portal menu
                </Button>
              </PopoverTrigger>
              <PopoverContent portal side="bottom" align="start" minWidth={220}>
                <PopoverItem data-testid="popover-portal-item-rename">
                  Rename
                </PopoverItem>
                <PopoverItem>Move to…</PopoverItem>
                <PopoverItem>Export</PopoverItem>
                <PopoverItem disabled>Delete (disabled)</PopoverItem>
              </PopoverContent>
            </Popover>
          </Row>

          {/* ----- Input variants -------------------------------------- */}
          <Row label="Input — bare (inherits heading font)">
            <div className="w-full font-headline text-h2 text-[var(--fg-primary)]">
              <Input
                size="bare"
                aria-label="Bare heading input"
                data-testid="input-bare"
                defaultValue="Untitled certificate"
              />
            </div>
          </Row>

          <Row label="Input — density=compact">
            <div className="w-full max-w-[280px]">
              <Input
                density="compact"
                aria-label="Compact meta input"
                data-testid="input-compact"
                placeholder="Compact meta field"
              />
            </div>
          </Row>

          <Row label="Input — flush (in a flex row)">
            <div className="flex w-full max-w-[360px] items-center gap-2 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-[var(--fg-muted)]" />
              <Input
                flush
                aria-label="Flush row input"
                data-testid="input-flush"
                placeholder="Flush field — no wrapper"
                className="bg-transparent"
              />
              <button
                type="button"
                aria-label="Clear flush field"
                data-testid="input-flush-clear"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--fg-muted)] hover:bg-[var(--overlay-weak)] hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </Row>
        </Section>

        {/* ================================================================ */}
        {/* BRAND, THEME & APP CHROME                                        */}
        {/* ================================================================ */}
        <Section title="Brand, theme & app chrome">
          <Row label="Brandmark — sizes (inherits color from --fg-primary)">
            <div className="flex items-center gap-4 text-[var(--fg-primary)]">
              <Brandmark size={24} />
              <Brandmark size={40} />
              <Brandmark size={56} />
              {/* decorative: hidden from a11y tree, no role/title. */}
              <Brandmark size={40} decorative />
            </div>
          </Row>

          <Row label="CertIcon — sizes + labelled">
            <div className="flex items-center gap-4 text-[var(--fg-primary)]">
              <CertIcon size={16} />
              <CertIcon size={24} />
              <CertIcon size={32} />
              <span className="inline-flex items-center gap-1.5 text-body-sm text-[var(--fg-secondary)]">
                <CertIcon size={18} />
                Certificate
              </span>
              {/* Standalone, labelled (role=img, exposed to AT). */}
              <CertIcon size={24} aria-label="Certified" />
            </div>
          </Row>

          <Row label="ThemeToggle — segmented (full)">
            <div className="w-full max-w-[360px]" data-testid="theme-toggle-segmented">
              <ThemeToggle variant="segmented" />
            </div>
          </Row>

          <Row label="ThemeToggle — segmented compact + cycle">
            <ThemeToggle variant="segmented" compact />
            <ThemeToggle variant="cycle" />
          </Row>

          <Row label="EditBanner — idle / saving / error">
            <div className="-mx-6 flex w-[calc(100%+3rem)] flex-col gap-3">
              <EditBanner
                label="Editing profile"
                onCancel={() => {}}
                onSave={() => {}}
              />
              <EditBanner
                label="Editing cert"
                isSaving
                onCancel={() => {}}
                onSave={() => {}}
              />
              <EditBanner
                label="Editing cert"
                canSave={false}
                error="Duplicate contributor"
                onCancel={() => {}}
                onSave={() => {}}
              />
            </div>
          </Row>
        </Section>

        {/* ================================================================ */}
        {/* IDENTITY & LINKS                                                 */}
        {/* ================================================================ */}
        <Section title="Identity & links">
          <Row label="IdentityRow — sizes + states">
            <div className="flex w-full max-w-[420px] flex-col gap-3">
              {/* md, full identity (display name + @handle). */}
              <IdentityRow
                did="did:plc:abcdef1234567890"
                handle="ada.bsky.social"
                displayName="Ada Lovelace"
              />
              {/* sm size variant. */}
              <IdentityRow
                size="sm"
                did="did:plc:zyxwvu0987654321"
                handle="grace.bsky.social"
                displayName="Grace Hopper"
              />
              {/* handle only — no display name, byline shows @handle. */}
              <IdentityRow
                did="did:plc:handleonly00000000"
                handle="alan.bsky.social"
              />
              {/* DID only — primary line falls back to a truncated DID. */}
              <IdentityRow did="did:plc:didonly1234567890abcdef" />
              {/* As a link (whole row navigates). */}
              <IdentityRow
                href="/dev/gallery"
                did="did:plc:linkrow00000000000"
                handle="linus.bsky.social"
                displayName="Linus Torvalds"
              />
              {/* Loading skeleton placeholder. */}
              <IdentityRow loading did="did:plc:loading000000000000" />
            </div>
          </Row>

          <Row label="SmartLink — brand detection + fallback (rendered as list)">
            {/* SmartLink emits an icon as a sibling of the <a>; the sidebar
                rules key on `li > svg`, so mirror that wrapper here. */}
            <ul className="flex w-full max-w-[420px] flex-col gap-2 [&_li]:flex [&_li]:items-center [&_li]:gap-2 [&_li>svg]:shrink-0 [&_li>svg]:text-[var(--fg-muted)]">
              <li>
                <SmartLink url="https://github.com/hypercerts-org/certified-app" />
              </li>
              <li>
                <SmartLink url="https://x.com/certified" />
              </li>
              <li>
                <SmartLink url="https://bsky.app/profile/ada.bsky.social" />
              </li>
              <li>
                <SmartLink url="https://linkedin.com/in/ada-lovelace" />
              </li>
              {/* Unrecognised host → generic link icon + bare hostname. */}
              <li>
                <SmartLink url="https://example.org/some/path" />
              </li>
            </ul>
          </Row>

          <Row label="FeedLabelPill — all quality labels">
            <FeedLabelPill label="high-quality" />
            <FeedLabelPill label="standard" />
            <FeedLabelPill label="draft" />
            <FeedLabelPill label="likely-test" />
          </Row>
        </Section>

        {/* ================================================================ */}
        {/* PAGINATION & INFINITE SCROLL                                     */}
        {/* ================================================================ */}
        <Section title="Pagination & infinite scroll">
          <Row label="Pagination — interactive (1-based, 5 pages)">
            <div className="w-full" data-testid="pagination-demo">
              <Pagination
                page={pageNum}
                pageCount={5}
                onChange={setPageNum}
                label="Gallery pagination demo"
              />
            </div>
          </Row>

          <Row label="LoadMoreSentinel — idle / loading">
            <div className="flex w-full flex-col gap-4">
              {/* Idle: clicking flips to the loading affordance briefly. */}
              <LoadMoreSentinel
                isLoading={loadingMore}
                onLoadMore={() => {
                  setLoadingMore(true);
                  setTimeout(() => setLoadingMore(false), 1200);
                }}
                className="flex justify-center"
              />
              {/* Pinned loading state so the spinner label is always snapshot. */}
              <LoadMoreSentinel
                isLoading
                onLoadMore={() => {}}
                className="flex justify-center"
              />
            </div>
          </Row>
        </Section>

        {/* ================================================================ */}
        {/* OVERLAYS — interactive triggers                                  */}
        {/* ================================================================ */}
        <Section title="Overlays (interactive triggers)">
          <Row label="Popover">
            <Popover>
              <PopoverTrigger>
                <Button variant="secondary" data-testid="open-popover">
                  Open popover
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start">
                <PopoverItem data-testid="popover-item-edit">Edit</PopoverItem>
                <PopoverItem>Duplicate</PopoverItem>
                <PopoverItem>Archive</PopoverItem>
                <PopoverItem disabled>Disabled action</PopoverItem>
              </PopoverContent>
            </Popover>
          </Row>

          <Row label="Toast">
            <Button
              variant="secondary"
              data-testid="fire-toast"
              onClick={() =>
                toast({
                  title: "Saved",
                  description: "Your changes were saved.",
                  variant: "success",
                })
              }
            >
              Fire toast (success)
            </Button>
            <Button
              variant="secondary"
              data-testid="fire-toast-error"
              onClick={() =>
                toast({
                  title: "Couldn't save",
                  description: "Try again in a moment.",
                  variant: "error",
                  action: { label: "Retry", onClick: () => {} },
                })
              }
            >
              Fire toast (error + action)
            </Button>
          </Row>

          <Row label="Dialogs & panels">
            <Button data-testid="open-appdialog" onClick={() => setAppDialogOpen(true)}>
              Open AppDialog
            </Button>
            <Button
              variant="destructive"
              data-testid="open-confirmdialog"
              onClick={() => setConfirmOpen(true)}
            >
              Open ConfirmDialog
            </Button>
            <Button data-testid="open-formdialog" onClick={() => setFormOpen(true)}>
              Open FormDialog
            </Button>
            <Button
              variant="secondary"
              data-testid="open-bottomsheet"
              onClick={() => setSheetOpen(true)}
            >
              Open BottomSheet
            </Button>
            <Button
              variant="secondary"
              data-testid="open-drawer"
              onClick={() => setDrawerOpen(true)}
            >
              Open Drawer
            </Button>
            <Button
              variant="secondary"
              data-testid="open-responsivedialog"
              onClick={() => setResponsiveOpen(true)}
            >
              Open ResponsiveDialog
            </Button>
            <Button
              variant="destructive"
              data-testid="open-deletedialog"
              onClick={() => setDeleteOpen(true)}
            >
              Open DeleteRecordDialog
            </Button>
            <Button
              data-testid="open-signinmodal"
              onClick={() => setSignInOpen(true)}
            >
              Open SignInModal
            </Button>
            <Button
              variant="secondary"
              data-testid="open-feedbackmodal"
              onClick={() => openFeedback()}
            >
              Open FeedbackModal
            </Button>
          </Row>
        </Section>
      </div>

      {/* ================================================================== */}
      {/* OVERLAY MOUNTS                                                     */}
      {/* ================================================================== */}
      {appDialogOpen && (
        <AppDialog
          ariaLabel="Demo dialog"
          maxWidth={440}
          onClose={() => setAppDialogOpen(false)}
        >
          <AppDialogHeader
            title="Demo dialog"
            onClose={() => setAppDialogOpen(false)}
          />
          <AppDialogBody>
            <p className="dash-card__desc" style={{ marginBottom: 20 }}>
              This is a bare AppDialog with the standard header chrome.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                data-testid="appdialog-close"
                onClick={() => setAppDialogOpen(false)}
              >
                Close
              </Button>
            </div>
          </AppDialogBody>
        </AppDialog>
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="Delete this record?"
          message="This action can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => setConfirmOpen(false)}
        />
      )}

      {formOpen && (
        <FormDialog
          title="Edit name"
          onClose={() => setFormOpen(false)}
          onSubmit={() => setFormOpen(false)}
        >
          <div className="mb-5">
            <Input label="Display name" defaultValue="Ada Lovelace" />
          </div>
        </FormDialog>
      )}

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Bottom sheet"
      >
        <div className="px-5 pb-5 text-body text-[var(--fg-secondary)]">
          Mobile bottom sheet content. (Visible below 800px.)
        </div>
      </BottomSheet>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ariaLabel="Demo drawer"
        side="left"
      >
        <div className="flex flex-col gap-3 p-6">
          <span className="font-headline text-h4 text-[var(--fg-primary)]">
            Drawer
          </span>
          <p className="text-body text-[var(--fg-secondary)]">
            Edge-anchored panel content.
          </p>
          <Button
            variant="secondary"
            data-testid="drawer-close"
            onClick={() => setDrawerOpen(false)}
          >
            Close
          </Button>
        </div>
      </Drawer>

      <ResponsiveDialog
        open={responsiveOpen}
        onClose={() => setResponsiveOpen(false)}
        ariaLabel="Responsive dialog"
        header={
          <AppDialogHeader
            title="Responsive dialog"
            onClose={() => setResponsiveOpen(false)}
          />
        }
        maxWidth={440}
      >
        <AppDialogBody>
          <p className="dash-card__desc">
            Renders as an AppDialog at desktop width and a BottomSheet below
            800px.
          </p>
        </AppDialogBody>
      </ResponsiveDialog>

      {deleteOpen && (
        <DeleteRecordDialog
          title="Delete this cert"
          recordName="Climate Action 2026"
          recordTypeLabel="cert"
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => setDeleteOpen(false)}
        />
      )}

      {/* SignInModal owns its own mount gate via isOpen; render unconditionally
          and drive it with the open flag. onSubmit handlers just close it. */}
      <SignInModal
        isOpen={signInOpen}
        error={null}
        onClose={() => setSignInOpen(false)}
        onSubmitEmail={async () => setSignInOpen(false)}
        onSubmitHandle={async () => setSignInOpen(false)}
      />

      {/* FeedbackModal is mounted globally by the root layout and driven by
          the feedback context; the trigger above calls openFeedback(). */}
    </div>
  );
}
