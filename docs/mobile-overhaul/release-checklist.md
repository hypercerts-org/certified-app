# Mobile-view overhaul — release-readiness checklist

Branch: `feat/mobile-view` → `staging`. Base captured at `staging` (tsc clean, lint 66
warnings / 0 errors). Desktop source-of-truth baseline = the ≥1300px full-desktop view.

## Implementation (6 tracks, all committed)

- [x] **Track 0 — Global foundation.** Tailwind `screens` → canonical 800/1100/1300 (kills the
  768px `md:` mismatch → inputs are 16px below 800px, no iOS focus-zoom); `<Button>` sm/md/icon meet
  44px on mobile and revert at ≥800px; `.app-shell__content` mobile gutter; legal heading scale;
  routing-scheme sanity (no stale `/profile//activity//project/` detection).
- [x] **Track 1 — Static / legal / error / auth.** `.dashboard__back-btn` un-shrunk (was 26px →
  44px full-width on mobile); error inline `fontSize` removed; oauth-callback text 16px + 44px link;
  legal list indent + link focus.
- [x] **Track 2 — Feed / Explore / Profile.** Added the **mobile profile tab strip** (mobile had no
  way to switch profile tabs — the desktop top-bar tabs are `display:none` <800px); surfaced
  pronouns + follower/following/endorsed-by on the mobile profile header (parity with the desktop
  sidebar); explore chrome 44px; home filter button/popover/rows.
- [x] **Track 3 — Create / Edit / Detail.** 16px meta inputs; 44px icon buttons (contributor,
  location, cert-remove, leaflet toolbar, map-expand); project-detail breakpoints 640/600/900 →
  800/1100; groups-create identity row stacks.
- [x] **Track 4 — Groups / Settings / Endorsements / Notifications / Apps.** Endorsement/tab/menu
  buttons 44px; `<Select sm>` 44px on mobile; image-overlay pills + subdomain input 44px; apps grid
  700→800; org-members rows stack; notification `:active` tap feedback; removed a redundant 520px block.
- [x] **Track 5 — Landing + breakpoint normalization.** Hero title de-floored (was 80px); partner
  grid 1-col with descriptions visible on touch; feedback trigger 44px; protocol/bento tightened;
  network-stats 600/900 → 800/1100; home news rail 1200 → 1100; `.app-page__inner` mobile gutter;
  **zero non-canonical breakpoints remain.**

## Gates

- [x] `npx tsc --noEmit` — clean (0 errors, matches baseline).
- [x] `npm run lint` — 66 warnings / 0 errors (no increase vs baseline).
- [x] `npm run build` — green (all 31 routes).
- [x] `npm test` — 605/605 pass (the formatGraphCount extraction + Button/Select changes are covered).
- [x] CLAUDE.md first-checks — all silent (radii, breakpoints, headings, modal backdrops).
- [x] No non-canonical `@media` width breakpoints anywhere in `src/app/styles/`.

## Adversarial review (workflow `wwebm4byv`, 7 agents)

- [x] **Desktop regression** — none. ≥1300px confirmed identical to `staging`; the only desktop
  shifts are the sanctioned breakpoint normalizations in intermediate bands (the ≥1300 baseline is
  preserved). The Tailwind `screens` remap only affects `md:text-sm` (3 input primitives), unchanged
  at ≥800px; Button/Select mobile bumps revert at `md`.
- [x] **Hard-rule compliance** — zero violations introduced.
- [x] **Logic correctness** — mobile tab strip mirrors the desktop `visibleProfileTabs` gating;
  `formatGraphCount` extraction is byte-equivalent; no duplicate DOM ids; hooks shared with the
  always-mounted sidebar (cache hit, no double-fetch).
- [x] All 3 completeness items raised were verified as non-issues (notification rows sit inside the
  16px app-shell gutter; the stat grid uses `minmax(0,1fr)` and a <360px breakpoint would violate the
  hard rule; apps `max-width:1080` is a no-op on mobile).

## Browser verification (Playwright, chromium)

- [x] 50 screenshots across public pages at 320 / 375 / 1300px, light + dark — all HTTP 200.
- [x] **No horizontal overflow** on any public page (320 & 375px). The lone 6px on `/dev/preview/*`
  is a dev-mode artifact (Next dev indicator + mocked-session hydration notice — present on the
  untouched feed preview too); `probe3` found zero real overflow leaves.
- [x] Profile mobile renders correctly: pronouns, "N followers · N following", "Endorsed by N", and
  the new scrollable tab strip with the active underline.
- [x] Landing mobile: hero scaled, network-stats stacked 1-col, partner grid 1-col with visible
  descriptions; bento single-column.
- [x] Dark mode verified at 375 & 1300px across welcome / explore / apps / legal pages.

### Caveat for the human reviewer
- The **authenticated** home feed could not be exercised logged-out except via `/dev/preview/feed`,
  whose harness nests an extra wrapper that narrows the feed column (a harness artifact — production
  renders `<Home />` directly in `.app-shell__content`, full-width on mobile per the unchanged
  home.css). Recommend one real signed-in smoke test of `/home`, `/create`, `/endorsements`,
  `/notifications`, `/groups`, `/settings` on a phone before promoting `staging → main`.
