# DESIGN.md polish proposals — certified-app

Scope: system-level improvements to `DESIGN.md` (plus the token and primitive changes each one implies). The brand stays as it is: monochrome, Noto Serif + Inter, 2px radius, document-like austerity, mobile-first. This was a read-only review and no project file was edited.

Sources read: `DESIGN.md` (all), `CLAUDE.md`, `AGENTS.md` §0/§11/§12/§25, `src/app/styles/tokens.css`, `tailwind.config.ts`, `src/app/layout.tsx` (font loading), `src/components/layout/app-shell.tsx`, `src/app/styles/layout.css`, and the primitives in `src/components/ui/` (button, input, textarea, select, checkbox, switch, card, badge, skeleton, empty-state, error-message, banner, app-dialog, bottom-sheet, drawer, popover, tooltip, toast, tabs, segmented-control).

Lenses applied: impeccable typography/typeset/layout/interaction-design/heuristics, emil-design-eng, apple-design (§12 materials, §15 typography), and the Web Interface Guidelines.

Contrast numbers were computed from the `tokens.css` values with the WCAG 2.x relative-luminance formula (script: `scratchpad/contrast.py`). The Tailwind behaviour in P1-1 was checked by compiling a probe with the repo's own Tailwind 3.4.

Priority key: **P1** is a bug or a contradiction that misleads agents, so fix it first. **P2** is a system gap with clear polish value. **P3** is nice to have.

---

## Owner decisions (2026-10-22)

- All P1/P2/P3 proposals accepted, with these choices:
- P1-5 serif heading weight: **load Noto Serif 600** (h2-h4 and EmptyState titles render at 600 as specced).
- P2-17 control borders: new `--border-control` at full 3:1 for **checkbox / radio / switch-off only**; text fields keep hairlines.
- P2-20 dialog and sheet titles: **serif `text-h4`**.
- P2-21 field labels: **sentence case, 0.8125rem / 500**; uppercase only for section eyebrows.
- P3-22 dark-mode reading compensation: **skipped**.
- P3-24 border tokens: collapse to four and **migrate every use now** (no aliases left behind).
- P3-25 stylelint: **added to CI as failing**, scoped to the CLAUDE.md hard rules (colors, shadows, z-index, radius, breakpoints). Font-size / letter-spacing / duration stay documented, not enforced, until the literals are migrated.

## Top 6 at a glance

1. **P1-1 Inputs show a blue focus ring.** `focus:ring-[var(--focus-ring)]/20` compiles to nothing in Tailwind 3.4, so `ring-1` falls back to Tailwind's default `rgb(59 130 246 / .5)`. That breaks monochrome on every Input, Textarea and Select.
2. **P1-2 DESIGN.md describes a layout and palette that no longer exist.** The rails were retired, the dark surfaces moved from `#0b0b0d` to `#18181b`, and `--fg-muted` changed. §14 is also bolted on as "supersedes earlier sections". Fold it in and make `tokens.css` the single numeric source.
3. **P1-3 Dark navbar and sheet tints are still on the old palette.** `--navbar-bg: rgba(11,11,13,.8)` resolves to `#0e0e10`, a band darker than the `#18181b` canvas.
4. **P1-4 Three badge/label tokens fail WCAG AA.** Light `--badge-warning-fg` is 3.63:1. Dark `--badge-neutral-fg` is 3.47:1 on elevated. Dark `--color-mid-gray`, used for Input labels, is 4.2:1 on elevated.
5. **P1-5 The type spec does not match what renders.** Noto Serif 600 is not loaded, so `text-h2/h3/h4` and the EmptyState title render at 700. Fix this as part of a full scale: one 10-step ramp with per-size tracking and leading, including the 13px step, which is the most-used size in the CSS (164 hits) but missing from the scale.
6. **P2 Motion and interaction-state tokens.** Add a duration/easing scale and correct the false "spring overshoots" claim. Add one hover/pressed/selected/disabled/focus spec, and gate hover to `(hover: hover)` for a mobile-first app.

---

## Proposals

### P1-1 — Focus ring: fix the dead Tailwind modifier and define one focus recipe
- **Section:** §4 Inputs ("Focus: border → `--focus-ring`, 1px ring at 20% opacity"). New §4.x "Focus".
- **Current:** Input, Textarea and Select use `focus:ring-1 focus:ring-[var(--focus-ring)]/20` (input.tsx:208-214, textarea.tsx:154-160, select.tsx:60). Tailwind 3.4 **emits nothing** for an opacity modifier on an arbitrary `var()` color. The compiled probe output for `focus:ring-[var(--focus-ring)]/20` and `bg-[var(--x)]/50` was empty, while plain `ring-[var(--focus-ring)]` compiled. `ring-1` still applies, so the ring is drawn in Tailwind's preflight default `--tw-ring-color: rgb(59 130 246 / 0.5)`, which is **blue**. `create/page.tsx` has the same dead `[var(--color-error)]/15` pattern. Separately, focus is expressed three different ways: an outline of 2px with 2px offset (Button, Checkbox, Popover), `shadow-[0_0_0_2px]` (AppDialog close), and border plus ring (inputs). The global `:focus-visible` rule in tokens.css also skips `input`, `select` and `textarea`.
- **Proposed text:**
  > **Focus.** One recipe, two geometries. Tokens: `--focus-ring` (color), `--focus-ring-width: 2px`, `--focus-ring-offset: 2px`.
  > - *Discrete controls* (buttons, links, tabs, checkbox, switch, menu items): `outline: var(--focus-ring-width) solid var(--focus-ring); outline-offset: var(--focus-ring-offset)` on `:focus-visible`.
  > - *Text fields* (Input, Textarea, Select, Combobox): `border-color: var(--focus-ring); box-shadow: 0 0 0 1px var(--focus-ring)` on `:focus` (2px total, inside the 2px radius, no offset so it doesn't collide with adjacent fields).
  > - Never use the Tailwind `/NN` opacity modifier on a `var()` color; it compiles to nothing. Use a pre-mixed token or `color-mix()`.
- **Also:** set `theme.extend.ringColor.DEFAULT = "var(--focus-ring)"` in tailwind.config so any stray `ring-*` can never be blue. Add check #6 to CLAUDE.md first-checks: `grep -rEn "\[var\(--[a-z0-9-]+\)\]/[0-9]+" src/` must be silent.
- **Rationale:** Monochrome brand (hard rule 9). WIG "visible focus everywhere". Heuristics: consistency and standards.
- **Blast radius:** input.tsx, textarea.tsx, select.tsx, combobox.tsx (verify), create/page.tsx, tailwind.config.ts, tokens.css (2 tokens), CLAUDE.md.
- **Risk:** Low. It is purely visual, and today's state is the bug. Check dark mode: `--focus-ring` is `#a0a0a8`, 5.27:1 on elevated.
- **Priority:** P1

### P1-2 — Fold §14 into the body and make tokens.css the only numeric source
- **Section:** Header callout, §2, §6, §9 "Quick Color Reference", §14.
- **Current:** The doc opens with "read §14 first … supersedes earlier sections where they contradict". At least 25 stale statements remain (see the Contradictions list). Every hex value in §2, §6 and §9 is a hand-copied duplicate, and several are now wrong. For example, the dark canvas is documented as `#0b0b0d` but is `#18181b`, and dark elevated is documented as `#1a1a1e` but is `#2d2d33`.
- **Proposed:**
  1. Apply each §14.1 rule in place (radius table, Don'ts, Iteration guide, breakpoints), then shrink §14 to a dated changelog entry.
  2. In §2, keep the *role* tables (name, token, role, usage rule) but drop the Light/Dark hex columns. Replace them with "values: see `tokens.css`; contrast: see §2.x table" (P1-4). Keep hex only in §9 prompts, and mark them "illustrative, verify against tokens.css".
  3. Renumber the gap (§10 jumps to §14) and remove AGENTS.md §0 references to a non-existent `PRODUCT.md` and to "§1–§13 Notary's Ledger North Star, civic palette".
- **Rationale:** Heuristics "consistency", plus agent-drift prevention, which is the doc's stated purpose. Two sources of truth guarantee drift.
- **Blast radius:** DESIGN.md and AGENTS.md §0/§11 only.
- **Risk:** Low. It is docs only, but it is the highest-leverage fix because agents copy hex values out of §9.
- **Priority:** P1

### P1-3 — Dark-mode translucent chrome: derive from the canvas, not literals
- **Section:** §5 Navbar, §6 Depth, tokens (`--navbar-bg`, `--sheet-bg`, `--selection-fg`, `--btn-primary-fg`).
- **Current:** In dark mode `--navbar-bg: rgba(11,11,13,0.8)` and `--sheet-bg: rgba(20,20,23,0.95)` were tuned for the retired `#0b0b0d` canvas. Over today's `#18181b` canvas the navbar resolves to `rgb(14,14,16)`, a visibly darker band, and the frosted effect reads as a hole rather than a material.
- **Proposed tokens:** `--navbar-bg: color-mix(in srgb, var(--bg-canvas) 80%, transparent)` and `--sheet-bg: color-mix(in srgb, var(--bg-elevated) 95%, transparent)`, defined once with no dark override needed. **Proposed DESIGN text (§6):** "Translucent chrome is always the surface it sits on at reduced alpha (never a separate literal). Over blur, text in the chrome uses `--fg-primary`/`--fg-secondary`, never `--fg-muted` (apple-design §12 vibrancy)."
- **Rationale:** apple-design §12: a material should be the same substance as what it floats over. Dark mode must work (hard rule 9).
- **Blast radius:** tokens.css (2 lines), layout.css navbar/top-bar (verify `--navbar-bg` consumers, 3 uses), bottom-sheet (1).
- **Risk:** Low. `color-mix` is Baseline 2023.
- **Priority:** P1

### P1-4 — Contrast table and three token fixes
- **Section:** §2 (new "Contrast" subsection), §4 Badges, §4 Inputs.
- **Computed (WCAG 2.x):**

| Pair | Light | Dark |
|---|---|---|
| `--fg-muted` on canvas / raised / elevated / sunken | 5.61 / 5.33 / 5.91 / 5.10 | 6.34 / 5.39 / **4.89** / 6.74 |
| `--fg-secondary` on canvas / elevated | 8.88 / 9.35 | 10.52 / 8.12 |
| `--focus-ring` on canvas / elevated | 6.16 / 6.48 | 6.82 / 5.27 |
| `--badge-success-fg` on its bg | 4.79 | 6.73 (on elevated) |
| **`--badge-warning-fg` on its bg** | **3.63 FAIL** | 6.12 |
| **`--badge-neutral-fg` on its bg, over elevated** | 5.42 | **3.47 FAIL** (4.63 over canvas) |
| **`--color-mid-gray`** (Input label) on elevated | 5.91 | **4.20 FAIL** |
| `--badge-count` white on bg | 6.47 | 4.83 |
| `--color-success` / `--color-warning` as text on canvas | **2.00 / 1.93** | n/a |

- **Proposed values:**
  - Light `--badge-warning-fg: #8a5700`, which gives 5.56:1 on `#fff3e0`. `#945d00` gives 5.01 if the owner wants it closer to the current hue.
  - Dark `--badge-neutral-fg: #aeaeb4`, which gives 5.12 on elevated and 6.84 on canvas. Note that even `--fg-muted` (#9a9aa1) only reaches 4.04 over the 6% white chip on elevated.
  - Input/Textarea labels move from `--color-mid-gray` (a landing token used inside an app primitive) to `--fg-muted`.
- **Proposed rule text:** "`--color-success` / `--color-warning` base hues are **fills and dots only** and never carry meaning alone. Text and icons use the `-text` / `badge-*-fg` companions. Every new fg/bg pair gets a row in the contrast table, with ≥ 4.5:1 for text under 18px and ≥ 3:1 for icons and boundaries."
- **Rationale:** WIG/WCAG AA. Badges are 11–12px uppercase, which is exactly where AA matters most.
- **Blast radius:** tokens.css (2 values), input.tsx and textarea.tsx label class, Badge visual parity screenshots.
- **Risk:** Low. Warning badges get slightly darker amber in light mode.
- **Priority:** P1

### P1-5 — One canonical type ramp, with weights that actually load
- **Section:** §3 Type Scale (replace the table), tailwind `fontSize`.
- **Current:** There are three partially overlapping scales: the DESIGN §3 role table, the tailwind `display/h1–h4/body/body-sm/caption` ramp, and roughly 30 distinct `font-size` literals in CSS (top five: 0.8125rem ×164, 0.75rem ×145, 0.875rem ×131, 0.6875rem ×71, 0.9375rem ×49, plus strays such as 0.85, 0.7, 0.78, 0.95, 0.9, 1.0625, 0.82, 0.72). Tailwind `h2/h3/h4` specify `fontWeight: 600` and EmptyState uses `font-semibold` on Noto Serif, but `layout.tsx` loads Noto Serif **300/400/700 only**. 600 therefore resolves to the 700 face, so the spec says 600 while the screen shows 700. Tailwind `caption` (0.75rem/+0.05em) also disagrees with DESIGN "Caption/label 0.6875rem, 0.08–0.2em".
- **Proposed ramp** (rem / leading / tracking / weight; serif = `font-headline`):

| Token | Size | Leading | Tracking | Weight | Font | Use |
|---|---|---|---|---|---|---|
| `display` | 3rem | 1.1 | -0.03em | 700 | serif | Rare app hero |
| `h1` | 2.25rem | 1.15 | -0.02em | 700 | serif | Page title (wide pages) |
| `h2` | 1.75rem | 1.2 | -0.015em | 700 | serif | Page title (column pages) |
| `h3` | 1.375rem | 1.3 | -0.01em | 700 | serif | Section title, profile name |
| `h4` | 1.125rem | 1.35 | -0.005em | 700 | serif | Card/feed title, empty-state, dialog title |
| `body` | 1rem | 1.6 | 0 | 400 | Inter | Reading text |
| `body-sm` | 0.875rem | 1.5 | 0 | 400/500 | Inter | Default UI text, descriptions |
| `ui` (**new**) | 0.8125rem | 1.45 | 0 | 400/500 | Inter | Dense chrome, meta rows, menu items (the most-used size in CSS) |
| `caption` | 0.75rem | 1.4 | +0.01em | 400/500 | Inter | Timestamps, helper/error text |
| `label` (**new**) | 0.6875rem | 1.2 | +0.06em | 600 | Inter, **uppercase only**, `'case' 1` | Eyebrows, section labels, square tags |
| `micro` | 0.625rem | 1 | +0.02em | 500 | Inter | Bottom-nav labels only |

- **Proposed rule text:** "Sizes not in this table are not allowed in new code. 0.9375rem, 0.85rem, 0.9rem and 0.95rem snap to `body-sm`; 0.7rem and 0.78rem snap to `caption`. Serif weights are 300 (landing display), 400 and 700 only, because 600 is not loaded and silently becomes 700."
- **Option for the owner:** If a quieter app voice is wanted for h3/h4, use **400** instead of synthesizing 600. A serif at 400 still reads as a heading at 1.125rem+ next to Inter, and it matches the landing's lighter register. Either way, the spec must name a loaded weight.
- **Rationale:** impeccable typography: "fewer sizes, more contrast", "name tokens semantically", "tracking and leading as part of the token". apple-design §15: tracking and leading are size-specific. The heading steps run at about a 1.25 major third (1.125 → 1.375 → 1.75 → 2.25 → 3).
- **Blast radius:** tailwind.config.ts `fontSize` (adds `ui`, `label`, `micro`, and changes the h2–h4 weight and tracking values), empty-state.tsx, then gradual CSS literal snapping (~60 off-scale declarations).
- **Risk:** Medium. Weight 600 → 700 is a zero-pixel change because that is already what renders. The tracking and leading tweaks are sub-pixel to about 1px per line, so screenshot-diff profile, cert-detail and feed.
- **Priority:** P1 for the spec and weight fix, P2 for snapping the literals.

### P2-6 — Uppercase-only letter-spacing; remove wide tracking from sentence-case text
- **Section:** §3 Principles ("Uppercase + wide tracking for labels: 0.08–0.2em"), §4 Buttons ("`tracking-wider`").
- **Current:** CSS uses 8 distinct positive tracking values (0.01, 0.02, 0.04, 0.05, 0.06, 0.08, 0.1, 0.15, 0.18em). `<Button>` applies `tracking-wider` (+0.05em) to every label, and those labels are sentence case ("Save changes"). ErrorMessage and Banner titles do the same. Input labels have +0.08em but are not uppercased.
- **Proposed text:** "Positive tracking exists only on uppercase text: one value, `+0.06em`, via the `label` step (≥ 0.1em only for the landing's mono registry numerals). Mixed-case UI text, including button labels, has 0 tracking. Spaced-out lowercase degrades word shapes."
- **Rationale:** impeccable typography (ALL-CAPS needs 5–12%; lowercase doesn't). apple-design §15 ("a fixed letter-spacing is wrong somewhere").
- **Blast radius:** button.tsx base classes, which changes every button's width by a few px, plus banner.tsx, error-message.tsx, input.tsx and textarea.tsx label classes, and ~45 CSS tracking declarations.
- **Risk:** Medium (visual). Buttons get slightly narrower and denser, which is a more "document-like" result. Screenshot-diff the nav and forms.
- **Priority:** P2

### P2-7 — Tabular numerals as a rule, not a class list
- **Section:** §3 OpenType Features.
- **Current:** DESIGN says "tnum on stats, counts, timestamps", but tokens.css only applies it to three BEM classes (`.feed-card__time`, `.dash-card__stat-value`, `.profile-hero__count-value`; dash-card is legacy), plus 35 ad-hoc `tabular-nums` uses. `'case'` is applied to a hand-maintained list of 7 classes. Using `font-feature-settings` also *replaces* any other feature settings on the element.
- **Proposed text:** "Any number that changes or sits in a column uses `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`), never `font-feature-settings`. This covers counts, badges, pagination, timestamps, funding amounts, stats and table cells. It is baked into `Badge` count variants, `Pagination`, and the `label`/`caption` steps where numbers appear. `'case' 1` is part of the `label` text style, not a class list in tokens.css. Use `slashed-zero` on DID/AT-URI/wallet strings (`WalletAddress`)."
- **Rationale:** impeccable typography (OpenType), WIG (`tabular-nums` for number comparisons). Counts that tick (notifications, endorsements) stop jittering.
- **Blast radius:** tokens.css (delete the two class lists), badge.tsx, pagination.tsx, wallet-address.tsx, tailwind `label` utility.
- **Risk:** Low.
- **Priority:** P2

### P2-8 — Rendering polish: balanced headings, pretty paragraphs, measure caps
- **Section:** §3 Principles, §5 Container Widths.
- **Current:** `text-wrap` is used 0 times. The center column (600/720px) is fine, but fullbleed pages (profile Overview, cert/project detail at 1280px) have no prose cap, and only 11 places use `ch` max-widths.
- **Proposed text:** "Headings (`h1`–`h4`, serif titles) use `text-wrap: balance`. Description and long-form paragraphs use `text-wrap: pretty`. Prose blocks cap at `max-width: 65ch` (`--measure: 65ch`) regardless of container width. The 1280px wide pages hold grids, not paragraphs."
- **Rationale:** impeccable typography (measure 45–75ch, balance/pretty). WIG.
- **Blast radius:** a base rule in tokens.css (`h1,h2,h3,h4{text-wrap:balance}`), one `--measure` token, plus cert-detail, project-detail and profile description blocks.
- **Risk:** Low. It is progressive enhancement.
- **Priority:** P2

### P2-9 — Fix the light-mode surface ramp semantics (`--bg-raised` is darker than canvas)
- **Section:** §2 Surfaces, §6 Depth.
- **Current:** The ramp is documented as Sunken < Canvas < Raised < Elevated. In light mode `--bg-raised` is `#f3f3f3`, which is **darker** than canvas `#f9f9f9` (luminance 0.896 vs 0.947), so a "raised" surface looks recessed. In dark mode it is lighter (`#26262b` vs `#18181b`). The same token has opposite depth meanings per theme.
- **Proposed:** Rename the role, keeping the value: `--bg-raised` → documented as **"tint: a quiet filled area (code blocks, location cards, test badges)"**. It is not an elevation step. The elevation ramp becomes **sunken → canvas → elevated → overlay** (see P2-10). Optionally add the alias `--bg-tint` and deprecate `--bg-raised` over time.
- **Rationale:** Heuristics (match between system and the world). Agents choose tokens by name.
- **Blast radius:** DESIGN.md text plus an optional alias token. No visual change.
- **Risk:** Very low.
- **Priority:** P2

### P2-10 — Overlay surface and dark-mode elevation rule
- **Section:** §6 Depth & Elevation, §4 Modals.
- **Current:** §6 says modal = `--bg-elevated` + `--shadow-lg` + backdrop blur. In code, AppDialog uses `bg-[var(--color-off-white)]`, a **landing** token, used in a canonical primitive, which equals canvas in both themes. It uses `--shadow-modal` (a fourth shadow, absent from hard rule #4 and §2) and has no backdrop blur. Popovers use `--bg-elevated` + `--shadow-md`. In dark mode, shadows (`rgba(0,0,0,.5–.6)`) are nearly invisible against `#18181b` and a 0.8-alpha backdrop.
- **Proposed text:**
  > Elevation levels: `sunken` < `canvas` < `elevated` (cards, inputs, popovers) < `overlay` (dialogs, sheets, drawers).
  > - New token `--bg-overlay`. Recommended value: `var(--bg-canvas)` (keeps today's look: dialogs are a lifted *page*, and inputs/cards inside them sit on `--bg-elevated`).
  > - Shadow tokens: `--shadow-sm` (controls: switch thumb, segmented active), `--shadow-md` (popover, tooltip, toast), `--shadow-lg` (drawer), `--shadow-modal` (dialog). Document all four. Cards never get shadows, including on hover (see contradiction C6).
  > - **Dark mode:** elevation is carried by **surface lightness + a hairline border** (`--border-default`), not shadow. Shadows stay but are not relied on. Floating surfaces in dark must be at least one step lighter than what is directly beneath them.
- **Rationale:** apple-design §12 (material weight encodes hierarchy). Monochrome dark-mode best practice. It also removes a landing-token leak from the portable primitive library (DESIGN header: "treat changes here as a shared dependency").
- **Blast radius:** tokens.css (+1 token), app-dialog.tsx (1 class), feedback-modal and domain modal (`--shadow-modal` consumers, 4 uses), tailwind `boxShadow` (+`modal`).
- **Risk:** Low. Identical pixels if `--bg-overlay = --bg-canvas`.
- **Priority:** P2

### P2-11 — One scrim token for every modal layer
- **Section:** §6 Overlays.
- **Current:** AppDialog uses `--modal-backdrop` (0.5 light / 0.8 dark). Drawer and BottomSheet use `--navy-overlay-30` (0.3 light / 0.5 dark). The feedback modal has its own backdrop. A sheet and a dialog presenting the same `ResponsiveDialog` content dim the page differently.
- **Proposed:** `--scrim: rgba(0,0,0,0.4)` light / `rgba(0,0,0,0.6)` dark, used by AppDialog `::backdrop`, Drawer, BottomSheet and FeedbackModal. Retire `--modal-backdrop` as an alias. Document: "One scrim. Blocking surfaces dim the page by the same amount on every viewport."
- **Rationale:** Consistency heuristic. emil-design-eng (unseen details compound).
- **Blast radius:** tokens.css, app-dialog.tsx, drawer.tsx, bottom-sheet.tsx, feedback-modal.
- **Risk:** Low.
- **Priority:** P2

### P2-12 — Interaction-state specification (hover, pressed, selected, disabled)
- **Section:** new §4.0 "Interaction states", referenced from Buttons, Cards, Tabs, Popover.
- **Current:** States are defined per primitive and drift. Hover is an opacity of .9 (primary, destructive), a border change (secondary), `--overlay-weak` (ghost, row card, popover item), or border plus `shadow-sm` (elevated card). Pressed is `--overlay-medium`. Disabled ranges over opacity .5, .6, and a sunken fill. §2 documents `--btn-primary-bg-hover`, but the **token does not exist**. Tailwind `hover:` is not gated, so taps leave sticky hover states on touch (1 `(hover: hover)` query in the codebase).
- **Proposed table:**

| State | Neutral surfaces (ghost, row, menu item, tab) | Filled (primary) | Outlined (secondary, input, elevated card) |
|---|---|---|---|
| Hover | bg `--overlay-weak`, text → `--fg-primary` | bg `--btn-primary-bg-hover` (new token: `#2a2a2a` / `#e5e5e7`) | border → `--border-hover` |
| Active (press) | `scale(0.98)` via `.press-scale`, 100ms ease-out | same | same |
| Selected / pressed toggle | bg `--overlay-medium` + `--fg-primary` + weight 600 | n/a | border `--fg-primary` |
| Focus-visible | P1-1 recipe | same | same |
| Disabled | `opacity: var(--opacity-disabled)` (0.5), `cursor: not-allowed`, no hover | sunken fill + `--fg-muted` + `--border-default` (keep current) | opacity 0.5 + `--bg-sunken` fill |
| Loading | keep fill, spinner replaces leading icon, `aria-busy` | same | same |

- **Proposed text:** "Hover styles apply only under `@media (hover: hover)`." Implement this with Tailwind `future.hoverOnlyWhenSupported: true`, a one-line config change that fixes sticky hover app-wide. "Selected ≠ hover: selection is always `--overlay-medium` + a weight or stroke change, never color alone."
- **Rationale:** impeccable interaction-design (state coverage). mobile-native (sticky hover). emil-design-eng (press feedback). Heuristics: visibility of system status.
- **Blast radius:** tailwind.config.ts (1 flag), tokens.css (+2 tokens), button.tsx (hover classes), input.tsx (`opacity-60` → token). Then audit CSS `:hover` rules in feed.css and layout.css over time.
- **Risk:** Medium. `hoverOnlyWhenSupported` changes all Tailwind `hover:` utilities, so verify on desktop (no change) and touch (no sticky states).
- **Priority:** P2 (P1 for the phantom token, since agents copy it)

### P2-13 — Motion tokens: separate duration and easing, and correct the "spring" claim
- **Section:** §4 Motion & Animation.
- **Current:** There are three combined tokens: `--transition-fast` (241 uses), `--transition-base` (17), and `--transition-slow` (**0 uses**). Primitives hard-code `duration-150` / `duration-300` / `0.3s ease-out`, and there are 25+ distinct duration/easing combinations (0.12s, 150, 200, 250, 280, 300, 400, 600, 700, 900ms …). DESIGN states that `cubic-bezier(0.16, 1, 0.3, 1)` "overshoots slightly before settling". It **cannot**: both control-point y values are ≤ 1, so it is an expo-out with no overshoot. Drawer and BottomSheet ("spring" in the doc) actually use `300ms ease-out`. Button and Card use `transition-all`.
- **Proposed tokens:**
  ```
  --duration-instant: 100ms;  /* press, color flips */
  --duration-fast:    150ms;  /* hover, focus, small fades */
  --duration-base:    200ms;  /* popover/tooltip/toast enter, tab panel */
  --duration-slow:    300ms;  /* dialog, sheet, drawer enter */
  --ease-out:        cubic-bezier(0.23, 1, 0.32, 1);  /* default UI */
  --ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1);   /* signature: dialogs, sheets (expo-out, no overshoot) */
  --ease-in-out:     cubic-bezier(0.65, 0, 0.35, 1);  /* on-screen movement, navbar hide */
  ```
  Keep `--transition-fast/base` as aliases (`var(--duration-fast) var(--ease-out)`), delete `--transition-slow`, and expose the tokens in tailwind `transitionDuration` / `transitionTimingFunction`.
- **Proposed rules:** "Exits run at ~75% of the enter duration. Never `transition: all`; name properties (`transform, opacity` / `background-color, border-color, color`). Never `ease-in` for UI. Nothing enters from `scale(0)`; the minimum is 0.95."
- **Rationale:** emil-design-eng (easing decision tree, no `transition: all`, exit faster than enter). apple-design (interruptibility). impeccable motion.
- **Blast radius:** tokens.css, tailwind.config.ts, button.tsx and card.tsx (`transition-all` → named properties), drawer.tsx and bottom-sheet.tsx (`--ease-emphasized`), DESIGN §4.
- **Risk:** Low to medium. Changing drawer/sheet to the emphasized curve is a visible but intended polish.
- **Priority:** P2

### P3-14 — Reduced motion: remove movement, keep meaning
- **Section:** §4 "`prefers-reduced-motion`".
- **Current:** A global kill-switch sets every animation and transition to 0.01ms. That also kills state-communicating fades (toast in, tab panel crossfade, skeleton pulse), so content pops.
- **Proposed text:** "Under reduced motion, translate/scale/rotate/parallax animations are removed. Opacity and color transitions ≤ 150ms remain. Spinners keep rotating, because they carry status. The kill-switch stays as a backstop, but primitives opt their fades back in with `motion-reduce:transition-opacity`." The landing's three-brake contract (§10) is unchanged.
- **Rationale:** apple-design (reduced motion ≠ no motion). WCAG 2.3.3 targets motion, not fades.
- **Blast radius:** tokens.css reduced-motion block, plus toast, tab-panel-transition and app-dialog.
- **Risk:** Low.
- **Priority:** P3

### P2-15 — Icon system: one size/stroke ladder tied to text steps
- **Section:** §4 Icons, §9 Iteration guide #9, AGENTS §12 "Icon sizing".
- **Current:** DESIGN says stroke "default" (Lucide default = 2) and 1.5/2.5 for the bottom nav. AGENTS says "1.5 default / 1.75 active / 2 emphasis". The code is dominated by **1.75** (180 uses), then 2 (57), 1.5 (18) and 1.25 (16), with strays at 0.7, 0.75, 1.1, 1.2, 2.25, 3 and 3.2. Sizes include 11, 12, 13 and 15 alongside 14/16/20/24.
- **Proposed table:**

| Size | Pairs with text step | Stroke | Use |
|---|---|---|---|
| 12 | `label` / `caption` | 2 | Meta-row glyphs, badge icons |
| 14 | `ui` / `body-sm` | 1.75 | Inline actions, menu items, chevrons |
| 16 | `body` / button md | 1.75 | Button icons, toast/banner icons |
| 20 | chrome | 1.5 | Top bar, navbar |
| 24 | bottom nav | 1.5 → **2.25 active** | Bottom nav (active = heavier stroke, never fill) |
| 40 | empty state | 1.25 | EmptyState rich |

- **Proposed text:** "Smaller icons get heavier strokes so the rendered weight stays constant (optical compensation). 11/13/15 px are snapped to the nearest step. Icon color inherits `currentColor`. Decorative icons get `aria-hidden`."
- **Rationale:** apple-design (optical consistency). Heuristics (consistency). It also documents the de facto 1.75 standard instead of fighting it.
- **Blast radius:** DESIGN and AGENTS text. Snapping the code is opportunistic, as files are touched.
- **Risk:** Low.
- **Priority:** P2

### P2-16 — Control-height scale and compact hit areas
- **Section:** §4 Buttons/Inputs, §8 Touch Targets.
- **Current:** Heights in use: 24 (AppDialog close `h-6`), 28 (Banner dismiss `h-7`, SegmentedControl sm), 32 (BottomSheet close, Segmented md), 34 ("Sign-in button 34px", §8), 36/44/56 (Input), 40/44 (icon Button). §7 says "touch targets ≥ 44px". The AppDialog close X is 24×24 on mobile.
- **Proposed text:**
  > Control heights: **32** (compact desktop-only), **36** (sm), **44** (md, and every control's minimum on < 800px), **56** (lg/hero). Icon buttons: 44 mobile / 40 desktop (`size="icon"`), plus `size="icon-sm"` (32 visual) whose hit area is expanded to 44 with a transparent `::after { inset: -6px }`.
  > Dismiss and close controls in Dialog, Sheet, Banner and Toast are `<Button size="icon-sm" variant="ghost" aria-label="Close">`, not hand-rolled buttons.
- **Rationale:** WIG / WCAG 2.5.8 (24px minimum) and the project's own 44px rule. Hard rule #8 (icon-only buttons are `<Button size="icon">`). AppDialog, Banner, Toast and BottomSheet currently each hand-roll their close button.
- **Blast radius:** button.tsx (+1 size), app-dialog.tsx, banner.tsx, toast.tsx, bottom-sheet.tsx.
- **Risk:** Low to medium. The dialog header gets a slightly larger X on mobile.
- **Priority:** P2

### P2-17 — Control boundary contrast token
- **Section:** §2 Borders, §4 Inputs.
- **Current:** Input/Select/Textarea rest border `--border-default` is **1.19:1** on elevated. The unchecked Checkbox border (`--border-hover`) and the off Switch track are **1.41:1** light and 1.79:1 dark. WCAG 1.4.11 asks for 3:1 for boundaries needed to identify a control. Hairlines are right for cards and dividers (decorative) but wrong for controls.
- **Proposed:** a new `--border-control`. A pragmatic value is `rgba(0,0,0,0.28)` light (about 2.0:1) and `rgba(255,255,255,0.30)` dark (2.6–2.7:1). Full 3:1 needs 0.45 / 0.35. That is heavier than the brand likes, so offer it as the owner's call and keep labels always visible as the compensating cue. Apply it to checkbox, radio and switch-off (strong case) and to text fields (owner's call).
- **Proposed text:** "Hairlines (`--border-subtle/default`) separate *content*. Controls a user must find and operate use `--border-control`."
- **Rationale:** WCAG 1.4.11, impeccable heuristics (affordance), austerity preserved for content.
- **Blast radius:** tokens.css (+1), checkbox.tsx, radio.tsx, switch.tsx, and optionally input/textarea/select.
- **Risk:** Medium (visible). Inputs become more defined, so review against the austerity goal.
- **Priority:** P2

### P2-18 — Spacing scale and vertical-rhythm rules
- **Section:** §5 Spacing System.
- **Current:** The listed scale includes 6px and 10px, and §14.1 #4 says "4-px grid". Usage guidance is loose ("12–16px component spacing").
- **Proposed text:**
  > Scale (Tailwind steps): **4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64** (`1 2 3 4 5 6 8 12 16`). 2 / 6 / 10 are allowed **only inside controls** to hit a fixed height (e.g. Button md `py-2.5` → 44px). They are never used between elements.
  > Rhythm (stack spacing, top to bottom):
  > - label → its control: 6 (the one in-control exception, `mb-1.5`)
  > - field → field, paragraph → paragraph: 16
  > - heading → its content: 8 (h4) / 12 (h3) / 16 (h2+)
  > - related groups within a card or section: 24
  > - section → section: 32 mobile / 48 desktop
  > - page top → first heading: 24 mobile / 32 desktop
  > Proximity rule: the space *above* a heading is always ≥ 2× the space *below* it.
- **Rationale:** impeccable layout (rhythm, proximity), typography (vertical rhythm). It codifies the doc's own "more space = new topic" philosophy as numbers.
- **Blast radius:** docs. Code snaps opportunistically.
- **Risk:** Low.
- **Priority:** P2

### P2-19 — Loading / empty / error state decision matrix
- **Section:** §4 Empty State, plus a new "Async states" subsection. AGENTS §25.
- **Current:** DESIGN says "skeleton for every data-fetching view", while AGENTS §25 says "Per-card loading — use LoadingSpinner". Errors can be `<ErrorMessage>`, `<Banner variant="error">` or a toast, with no rule for which. Skeleton fill is `--overlay-weak`, which is 1.09:1 on light elevated and barely visible. DESIGN says skeletons use `--color-surface-container` (a token that does not exist) with a 1.5s 0.4→1 pulse, but code uses Tailwind `animate-pulse` (2s, 1→0.5).
- **Proposed matrix:**

| Situation | Pattern |
|---|---|
| List/feed/card content loading, < ~2s expected | `<Skeleton>` mirroring the final geometry. Show it only after 150ms (avoid flash). |
| Whole-route auth or bootstrap | `<LoadingSpinner>` (Brandmark pulse), centered |
| Action in progress | Button `loading` (never a page spinner) |
| Empty because the user has made nothing yet | `<EmptyState variant="rich">` with a CTA |
| Empty because of filter/search | `<EmptyState variant="inline">` plus a "Clear filters" action |
| Section failed to load | `<ErrorMessage onRetry>` in place of the section |
| Page-level degraded/info state | `<Banner>` |
| Action failed / succeeded (transient) | `toast` (errors: sticky until dismissed if they need action) |

  New token `--skeleton-bg: var(--bg-sunken)` light / `rgba(255,255,255,0.06)` dark (≈1.1–1.2:1, visible without shouting). Document the actual pulse.
- **Rationale:** impeccable interaction-design (state coverage), heuristics (visibility of status, error recovery). It also removes the AGENTS/DESIGN contradiction.
- **Blast radius:** DESIGN, AGENTS §25, skeleton.tsx (1 class), tokens.css (+1).
- **Risk:** Low.
- **Priority:** P2

### P2-20 — Dialog and sheet titles speak one voice
- **Section:** §4 Modals.
- **Current:** `AppDialogHeader` renders the title as Inter 0.8125rem / 600 / +0.02em (chrome voice). `BottomSheet` renders its title as `font-headline text-h4` (content voice). `ResponsiveDialog` shows the same content as one or the other depending on viewport, so the title changes typeface at 800px.
- **Proposed text:** "Dialog and sheet titles are `font-headline text-h4` (serif 1.125rem/700, balanced), left-aligned, with the close control at the trailing edge. A dialog is a document page in miniature, so it follows 'serif for content'. Eyebrow context above the title, if needed, uses the `label` step."
- **Rationale:** Consistency heuristic. The brand's own "serif for content, sans for chrome" rule (a dialog title names content). Hard rule #6.
- **Blast radius:** app-dialog.tsx header (1 class). Screenshot all dialogs (sign-in, confirm, delete, feedback).
- **Risk:** Low to medium. Every dialog title gets larger and serif. Alternative: make the sheet match the dialog (Inter), which is less on-brand.
- **Priority:** P2

### P2-21 — Input and form-field label style
- **Section:** §4 Inputs.
- **Current:** The field label is 0.6875rem / 600 / +0.08em, mixed case, `--color-mid-gray` (a landing token, which fails AA in dark mode on elevated, see P1-4). That is wide tracking on lowercase at 11px, the smallest size in the app, for the most important form text.
- **Proposed:** "Field labels: `ui` step (0.8125rem) / 500 / 0 tracking / `--fg-secondary`, sentence case. Helper text: `caption` / `--fg-muted`. Error text: `caption` / `--color-error`, paired with an icon (color is never the sole signal). The uppercase `label` step is for section eyebrows, not field labels."
- **Rationale:** WIG (legible labels), impeccable typography (tracking), WCAG AA.
- **Blast radius:** input.tsx, textarea.tsx, select.tsx, and any form-dialog labels.
- **Risk:** Low to medium. Forms read noticeably calmer and more legible.
- **Priority:** P2

### P3-22 — Dark-mode reading compensation
- **Section:** §3 Principles (new bullet).
- **Proposed:** "In `[data-theme=dark]`, long-form body (`body` step in prose blocks) gets `line-height +0.05` and `letter-spacing +0.005em`. Light-on-dark text reads heavier and tighter. Do not change weights."
- **Rationale:** impeccable typography ("light text on dark needs compensation on three axes").
- **Blast radius:** one rule in tokens.css scoped to prose containers.
- **Risk:** Low.
- **Priority:** P3

### P3-23 — Trim unused font weights
- **Section:** §3 Font Families.
- **Current:** Inter loads 300/400/500/600/700, but DESIGN forbids 700 on Inter, and no `font-light` / Inter-300 usage was found (0 hits). There are 19 CSS `font-weight: 700` declarations, which need auditing to see whether they are serif.
- **Proposed:** Load Inter as the variable font (one file, all weights) *or* restrict it to 400/500/600. Document: "Inter: 400 / 500 / 600. Noto Serif: 300 (landing), 400, 700."
- **Rationale:** impeccable typography (web font loading). Performance.
- **Blast radius:** layout.tsx, plus an audit of the 19 `font-weight: 700` CSS declarations.
- **Risk:** Low.
- **Priority:** P3

### P3-24 — Prune the token surface and document what remains
- **Section:** §2 / §6.
- **Current:** There are border tokens at 0.04 / 0.06 / 0.08 / 0.10 / 0.12 / 0.15 alpha (`subtle`, `light`, `default`, `medium`, `hover-soft`, `hover`), six steps for one hairline concept, and Card already says "do not reintroduce `--border-light`". Undocumented live tokens: `--shadow-modal`, `--scrim-pill*`, `--media-letterbox`, `--accent-gold*`, `--color-*-text/bg/border`, `--top-bar-*`, `--z-tour-*`, `--z-tooltip`, `--z-local-raise`. tokens.css lists `--color-accent` under "Invariant primitives (do NOT override)" but overrides it in dark mode.
- **Proposed:** Collapse borders to four: `subtle` (dividers), `default` (boxes), `hover`, plus `control` (P2-17). Alias `light` → `subtle`, `medium` → `default`, and `hover-soft` → `hover` (32 + 8 + 4 consumers to migrate over time). Add a complete token appendix to DESIGN generated from tokens.css. Move `--color-accent` out of the invariant block.
- **Rationale:** Heuristics (minimalism), drift prevention.
- **Blast radius:** tokens.css aliases (no visual change), then gradual migration.
- **Risk:** Low.
- **Priority:** P3

### P3-25 — Enforce, don't just describe: add a stylelint layer
- **Section:** §14.6 ("A stylelint rule … didn't make it"), CLAUDE.md first checks.
- **Proposed:** Ship `stylelint-declaration-strict-value` for `color`, `background*`, `border-color`, `box-shadow`, `z-index`, `border-radius`, `font-size`, `letter-spacing` and `transition-duration`, allowing only `var(--*)` outside tokens.css and landing.css. Add the P1-1 dead-modifier grep. The grep checklist then becomes CI.
- **Rationale:** The doc exists to stop drift. Today, 30 font sizes, 18 tracking values and 25 durations show that description alone is not enough.
- **Blast radius:** package.json and CI. It starts with a warning level against the baseline.
- **Risk:** Low.
- **Priority:** P3

---

## Contradictions and stale content (fix in the P1-2 rewrite)

| # | Where | Says | Reality / conflict |
|---|---|---|---|
| C1 | §1 para 3 + bullets | "No desktop sidebar, no multi-column dashboard"; "hamburger sidebar" | §5 then documents desktop rails, and code has neither: rails were **retired in the Overview redesign** (`app-shell.tsx` header comment, `layout.css` "both rails retired"). Desktop chrome is the `DesktopTopBar` (52px row 1 + 44px profile-tabs row 2), and the profile page is a 2-column GitHub-style Overview at 1280px. |
| C2 | §5 "Rail visual specs", "Logged-out variant", "Left Rail", "Right Rail", "Breakpoint cascade"; §8 Breakpoints table | 86/240px left rail, 250/300px right rail, sticky search, footer in rail | All retired. The 1100/1300 breakpoints still appear in 8 media queries; document what they now control. The desktop top bar is entirely undocumented. |
| C3 | §5 Navbar | "Fixed at top, 64px … hides on scroll" | Mobile-only now (desktop zeroes `--navbar-height`). The desktop equivalent is the top bar. |
| C4 | §2 tables, §6 table, §9 Quick Color Reference + every §9 prompt | dark canvas `#0b0b0d`, elevated `#1a1a1e`, sunken `#08080a`, raised `#141417`; light fg-muted `#7e7576`; dark fg-muted `#8e8e93`; dark success/warning `#2ECC71/#F5A623` | tokens.css: `#18181b / #2d2d33 / #111114 / #26262b`; `#6b6263`; `#9a9aa1`; `#34d399 / #fbbf24`. |
| C5 | §2 Primary Button | `--btn-primary-bg-hover` `#2a2a2a/#e5e5e7` | Token does not exist. Button hover is `opacity: .9`. |
| C6 | §7 "Don't add shadows to cards"; §9 "No new shadows on cards" | | `Card variant="elevated" hoverable` adds `hover:shadow-sm`. Decide one way or the other (recommend removing the shadow and keeping the border shift). |
| C7 | §4 Buttons | Destructive hover "bg error/15, border error/35" | Code: `--color-error-bg` / `--color-error-border` + `hover:opacity-90`. The `/15` syntax would compile to nothing anyway (P1-1). |
| C8 | §9 Primary button prompt | "Disabled: opacity 0.5" | Filled variants use a sunken fill + muted text + border (button.tsx). |
| C9 | §4 Inputs "iOS auto-zoom rule" | `@media (max-width: 768px)` | Violates hard rule 3. Tailwind `md` = 800 now; the rule is `< 800px`. |
| C10 | §5 Border Radius Scale | 4px desktop feed images; 16px bottom-sheet top corners | §14.1 #1 says "no exceptions"; bottom-sheet.tsx uses `rounded-t-[var(--radius)]`. |
| C11 | §7 Don't, bullet 1; §9 Iteration #2 | "sign-in modal's 20px and 8px input are deliberate exceptions"; "999px for … avatars, sign-in submit" | Retired (§14.1 #1); avatars are 50%; sign-in submit is 2px. |
| C12 | §6 Modal row; §4 Modals | Modal = `--bg-elevated` + `--shadow-lg` + backdrop blur | AppDialog = `--color-off-white` (landing token) + `--shadow-modal` + no blur (P2-10). |
| C13 | §4 Motion | spring curve "overshoots slightly"; `--transition-slow` for "sidebar slide, bottom sheet" | The curve cannot overshoot. `--transition-slow` has 0 uses; drawer and sheet use `300ms ease-out`. |
| C14 | §4 Motion "Skeleton pulse 0.4→1→0.4, 1.4–1.5s"; §9 skeleton prompt `--color-surface-container (#eeeeee)` | | Skeleton = `--overlay-weak` + Tailwind `animate-pulse` (2s, 1→0.5). `--color-surface-container` does not exist (also cited in §5 Image Treatment). |
| C15 | §3 Type Scale | Empty-state heading 600; caption 0.6875rem 0.08–0.2em | Serif 600 is not loaded, so it renders 700. Tailwind `caption` is 0.75rem/+0.05em. |
| C16 | §3 Principles | "Headlines at 1rem+ use -0.01 to -0.02em" | Tailwind h3/h4 have no tracking; h2 is -0.01; feed title has none. |
| C17 | §3 "Tiny 0.625rem Bottom nav labels" vs §9 Bottom nav prompt "No labels on current build", "White background", inactive `#7e7576` | | Self-contradictory and stale colors. |
| C18 | §4 has both "Feed Label Pills" and "Feed Label Pill" | | Duplicate sections; merge under Badge. |
| C19 | §4 Cards (`.app-card`, `.dash-card`, `.feed-card` specs) | | §14.2 says to migrate to `<Card variant>`. Document `<Card>` as primary, with BEM as legacy. |
| C20 | §9 Common mistakes "Adding multi-column layouts on desktop … don't create 2-column grids" | | The profile Overview is an intentional 2-column layout at 1280px. Restate as "no multi-column in the reading column; wide pages are explicit opt-ins via `.app-shell--fullbleed`". |
| C21 | §4 Icons / §9 #9 vs AGENTS §12 | stroke "default" (=2) vs "1.5 default / 1.75 active" | The code standard is 1.75 (P2-15). |
| C22 | AGENTS §25 | "Per-card loading — use LoadingSpinner"; "Modals trap focus with useFocusTrap" | Contradicts DESIGN (skeletons) and hard rule 7 (AppDialog). |
| C23 | AGENTS §0 | Points to `PRODUCT.md` and "§1–§13 … Notary's Ledger North Star, civic palette, three-step shadows" | PRODUCT.md does not exist; DESIGN has no §11–13; there are four shadows. |
| C24 | AGENTS §0 rule 2 vs CLAUDE.md rule 2 | "outside tokens.css" vs "outside tokens.css and landing.css" | Align. |
| C25 | tokens.css comments | `--color-accent` in the "Invariant primitives (do NOT override)" block | It is overridden in dark mode. |
| C26 | components.css:115-123 and landing.css:1455-1463 | | Duplicate `@keyframes modalFadeIn` / `modalSlideUp` (identical today; a latent cascade-order trap). |
| C27 | §8 Touch Targets "Sign-in button 34px height" | | Below the 44px rule stated in §7; either justify it as a desktop-only control or fix it (P2-16). |
