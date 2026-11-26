# Toolkit gaps

Components and props certified.app needed from `@hypercerts-org/ui-react` and
built itself, or bridged with app CSS. Each is a proposal for
[hypercerts-design](https://github.com/hypercerts-org/hypercerts-design); when
one ships, the app code or CSS named beside it goes.

The rule for app CSS: never select a toolkit component's internal classes
(`.rounded-full`, `.text-hc-*`) or style `*` inside one. The only exceptions
are the rules in the "Toolkit bridges" section at the end of
`src/app/globals.css`, each listed here.

## Bridged in CSS today

| Gap                                 | Proposal                                                                                                                                                         | Bridge in the app                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Unframed empty state                | `EmptyState variant="plain"`, and `actions` for several buttons that wrap                                                                                        | `.empty` (`Empty`, `empty.tsx`)                                                             |
| Fading long text                    | `ExpandableText variant="fade"`: the last lines fade out, and the toggle is a plain underlined link without a chevron                                            | `.expandable-fade`                                                                          |
| IdentityLink name on narrow screens | `IdentityLink` hides its name from sight below a width (still the link's name), keeping the avatar                                                               | `.list-item-who > [dir="auto"]` (`globals.css`)                                             |
| Touch font on Textarea and Select   | `Textarea` and `Select` step up to `field-touch` on touch screens, as inputs do since 0.3.4                                                                      | `@media (pointer: coarse)` `textarea, select` rule in `globals.css`                         |
| App density                         | A compact Certified type scale for applications (14px body, 28px page titles), and a body font size in `base.css`, which sets none                               | the type tokens and `body` rule in the theme block of `globals.css`                         |
| Tooltips at the edge                | Button tooltips stay inside the viewport (align to the edge or flip), and add no width while hidden (today a hidden tooltip near the right edge widens the page) | a short `tooltip` on the profile's "More actions" button; `.site-main { overflow-x: clip }` |

## Built in the app

| Gap                  | Proposal                                                                                                                                          | Where it lives now                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Tabs that are links  | `NavTabs`: `items: { href, label, count?, current }` as `<nav>` links with `aria-current`, underline and segmented variants, scrolling sideways   | `ProfileTabs` (`profile-actions.tsx`)                                |
| Pending-link state   | Let the `UIProvider` link adapter report "pending" (Next's `useLinkStatus`), so tabs and nav items look current while their page loads            | `LinkPending` (`link-pending.tsx`) and its CSS                       |
| Navigation rows      | `NavItem` / `NavList`: icon and label link with current, unavailable (with a reason) and pending states                                           | `.sidebar-item`, `.workspace-nav-item`, `.nav-link`, `.menu-row`     |
| Unavailable actions  | `Button unavailableReason`: `aria-disabled`, stays focusable, reason as tooltip on hover, focus and tap, and as hidden text                       | `ComingSoonButton` (`coming-soon.tsx`)                               |
| Async confirm dialog | `ConfirmDialog` with `loading`, error banner, and responsive mobile sheet (so destructive actions don't rebuild a dialog with `ResponsiveDialog`) | `RevokeEndorsementButton`, `DeleteListDialog`, `MemberActions`       |
| Media rows           | `MediaRow`: square thumbnail (image or icon), title, meta line, trailing slot, optional `href`, hairline list styling                             | `.overview-row` family (`workspace-overview.tsx`, `records.tsx`)     |
| Counts               | `Stat` / `StatRow`: a number over its label, optional `href`, tabular figures, "+" when capped                                                    | `StatRow` (`stat-row.tsx`)                                           |
| Eyebrow as a heading | `Eyebrow as="h2" \| "h3"`                                                                                                                         | `ListLabel` wraps an `Eyebrow` in an `h3` (`workspace-overview.tsx`) |
| Search in a GET form | `SearchInput` with `name`, `inputRef`, a plain-form submit mode without debounce, a shortcut hint                                                 | the sidebar's search (`sidebar-nav.tsx`)                             |
| Toasts with actions  | `Toast` action buttons, pause on hover and focus, an imperative `toast()`; or a documented theme mapping for Sonner                               | Sonner, themed in `globals.css`                                      |
| Facts                | `DescriptionList`: label and value pairs                                                                                                          | the profile rail's `.facts`, the workspace's `.overview-id-list`     |

## Shipped

In `@hypercerts-org/ui-react`, and in use:

- 0.3.3: `Button pressed` on `secondary` and `ghost`, `MenuButton size="sm"`,
  `Checkbox align`, `CopyableId wrap`, `InputGroupInput invalid`, and
  `Combobox` with `Field`'s props, `size`, `inline`, `listboxClassName` and
  `leading` / `trailing` slots (the site search and `ActorPicker`).
- 0.3.4: `Avatar shape` and an opaque fallback, `IdentityRow avatarShape`,
  `IdentityLink`, `AvatarStack` (the app's `ActorAvatar`, `ActorLink`,
  `ActorRow` and stacks; `actor.tsx` now only maps an account to their
  props), `DatePicker fullWidth`, the touch-screen font floor on inputs, and
  `SearchInput` without the browser's second clear button. `CopyableId wrap`
  replaces `HandleId` and `PermanentId`.
