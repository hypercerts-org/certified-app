# Design system

How certified.app looks, and the few values it is built from. Every page
uses these and nothing else: when something new seems to need a size, a gap
or a color outside them, change the system here (and in the theme block of
`src/app/globals.css`), never the one page.

The tokens live in the `[data-hc-theme="certified"]` block at the top of
`src/app/globals.css`. They override the Hypercerts UI toolkit's Certified
theme, which is sized for marketing pages (16px body, page titles up to
44px); the app is an application, compact like the staging redesign. The
landing page (`/welcome`, `src/app/landing.css`) is an editorial page with a
system of its own and is outside this one.

## Type

One scale, set through the toolkit's tokens, so `Text` and `Heading` sizes
and `var(--hc-type-*)` in CSS all follow it. Nothing else sets a font size.

| Token       | Size | Line height | Use                                                   |
| ----------- | ---- | ----------- | ----------------------------------------------------- |
| `display-2` | 28px | 1.2         | Page titles (`PageTitle`, `PageHeader`), one per page |
| `display-3` | 20px | 1.3         | Figures (counts in stat rows)                         |
| `heading`   | 16px | 1.35        | Section and card titles                               |
| `body`      | 14px | 1.55        | Text, row titles, navigation, section descriptions    |
| `body-sm`   | 13px | 1.5         | Secondary text: meta lines, dates, authors            |
| `label`     | 12px | 1.4         | Form labels, the sidebar's section names, keys        |
| `micro`     | 12px | 1.35        | Small buttons, counts. 12px is the floor              |

Why these:

- **Body text at 14px**, the same as the sidebar's items, so navigation and
  content weigh the same. Steps above it grow by about a fifth (14, 16, 20)
  and the page title doubles it (28): each level reads as a level, and
  there are few enough that every one has a job.
- **Line height falls as size rises**: 1.55 for running text, 1.2 for the
  page title. Large type set at body leading falls apart into lines.
- **Hierarchy comes from size, weight and color together**, not size alone:
  a meta line is smaller _and_ muted; a title is serif (display font) and
  heavier. Two adjacent sizes (13, 14) never carry hierarchy on their own.
- **Weights**: 400 for text, 500 (`--hc-weight-medium`) for row titles and
  names, 600 (`--hc-weight-strong`, also `--hc-weight-display`) for headings
  and the current item. No other weights.
- **Fonts**: Noto Serif for headings (`h1`–`h4`), Inter for everything else,
  monospace only for identifiers (handles, DIDs, transaction IDs).

## Spacing

A 4px grid, named by multiples of 4px: `--space-1` is 4px, `--space-4` 16px.
Every gap, margin and padding is one of `--space-0-5` (2px, hairline
nudges), 1, 2, 3, 4, 5, 6, 8, 10, 12, 16. The only other values align
something with an icon's size or offset an edge, and say so in a comment.

### Vertical rhythm

What belongs together sits closer than what doesn't. A heading is nearer
its own content than the section above it, so the eye groups it forward.

| Token                | Value  | Between                                  |
| -------------------- | ------ | ---------------------------------------- |
| `--rhythm-caption`   | 4px    | A section heading and its description    |
| `--rhythm-title`     | 8px    | A page title and its intro line          |
| `--rhythm-block`     | 12px   | A section's header and its content       |
| `--rhythm-section`   | 32px   | One section and the next (`.page`'s gap) |
| `--rhythm-paragraph` | 0.75em | Paragraphs of running text               |

Running text is no wider than about 70 characters (`.measure`).

## Color

Only the theme's tokens; no hex values in app CSS.

- Text: `--hc-text-ink` (titles, primary text), `--hc-text-body` (long
  passages), `--hc-text-muted` (descriptions, meta, inactive items).
- Surfaces: `--hc-surface-page` (the canvas), `--hc-surface-panel` (boxes,
  the sidebar), `--hc-surface-tint` (hover, current item, placeholders),
  `--hc-fill-subtle` (pressed, notices).
- Lines: `--hc-line-hairline` between rows and around boxes.

## Patterns

- **Page header**: `PageHeader` (title, an optional muted intro line,
  actions on the right). Pages without an intro use `PageTitle`.
- **Section**: a `.section-heading` (a `heading`-size `Heading` and an
  optional muted description), an action or a "See all" link on the right,
  then the content `--rhythm-block` below.
- **Rows**: a hairline between rows, a 40px picture or avatar, the title in
  `body` medium, a meta line in `body-sm` muted.
- **Empty states**: always `Empty` (`src/components/empty.tsx`): no frame,
  the icon of what the list holds, at most one action. Never a bare box, never
  plain text. The title names the list, after its tab: "No {list} yet" ("No
  endorsements given yet", "No accounts followed yet", "No badges accepted
  yet"), no full stop. On a public profile the title stands alone; in your
  own workspace one line under it says how the list fills.
- **Figures** (`StatRow`): a large number over its label; a linked figure
  tints whole on hover, never an underline.
- **Sub-tabs** (a tab's lists, as segmented links): each carries its count,
  none when empty.
- **Notices**: a `--hc-fill-subtle` bar with the message on the left and the
  way out on the right (Explore's "Showing featured picks").
- **Loading**: skeletons shaped like the component they stand in for, inside
  the component's own Suspense boundary.
