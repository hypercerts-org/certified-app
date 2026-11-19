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

| Gap                   | Proposal                                                                                                              | Bridge in the app                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Square avatars        | `Avatar shape="circle" \| "square"`, forwarded by `IdentityRow`                                                       | `.identity-org .rounded-full` (rows), `.avatar-square` (Avatar's own `className`) |
| A larger identity row | `IdentityRow size="lg"` (name at body, secondary at body-sm, 40px avatar)                                             | `.overview-rows .text-hc-body-sm`, `.text-hc-micro`                               |
| Unframed empty state  | `EmptyState variant="plain"`, and `actions` for several buttons that wrap                                             | `.overview-empty`                                                                 |
| ID shown as a field   | `CopyableId variant="field"`: full width, tinted, body-size text, ellipsis                                            | `.overview-id-field`                                                              |
| Fading long text      | `ExpandableText variant="fade"`: the last lines fade out, and the toggle is a plain underlined link without a chevron | `.expandable-fade`                                                                |

## Built in the app

| Gap                  | Proposal                                                                                                                                        | Where it lives now                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Tabs that are links  | `NavTabs`: `items: { href, label, count?, current }` as `<nav>` links with `aria-current`, underline and segmented variants, scrolling sideways | `ProfileTabs` (`profile-actions.tsx`)                                 |
| Pending-link state   | Let the `UIProvider` link adapter report "pending" (Next's `useLinkStatus`), so tabs and nav items look current while their page loads          | `LinkPending` (`link-pending.tsx`) and its CSS                        |
| Navigation rows      | `NavItem` / `NavList`: icon and label link with current, unavailable (with a reason) and pending states                                         | `.sidebar-item`, `.workspace-nav-item`, `.nav-link`, `.menu-row`      |
| Unavailable actions  | `Button unavailableReason`: `aria-disabled`, stays focusable, reason as tooltip on hover, focus and tap, and as hidden text                     | `ComingSoonButton` (`coming-soon.tsx`)                                |
| Media rows           | `MediaRow`: square thumbnail (image or icon), title, meta line, trailing slot, optional `href`, hairline list styling                           | `.overview-row` family (`workspace-overview.tsx`, `work-folders.tsx`) |
| Counts               | `Stat` / `StatRow`: a number over its label, optional `href`, tabular figures, "+" when capped                                                  | `StatRow` (`workspace-overview.tsx`)                                  |
| Disclosure rows      | `DisclosureRow`: a `<details>` summary row with a chevron and a trailing action outside the summary                                             | `FolderView` (`work-folders.tsx`)                                     |
| Eyebrow as a heading | `Eyebrow as="h2" \| "h3"`                                                                                                                       | `ListLabel` wraps an `Eyebrow` in an `h3` (`workspace-overview.tsx`)  |
| Search in a GET form | `SearchInput` with `name`, `inputRef`, a plain-form submit mode without debounce, a shortcut hint                                               | the sidebar's search (`sidebar-nav.tsx`)                              |
| Toasts with actions  | `Toast` action buttons, pause on hover and focus, an imperative `toast()`; or a documented theme mapping for Sonner                             | Sonner, themed in `globals.css`                                       |
| Facts                | `DescriptionList`: label and value pairs                                                                                                        | the profile rail's `.facts`, the workspace's `.overview-id-list`      |
| Avatar stack         | `AvatarStack`: overlapping faces ringed in the page colour, "+N"                                                                                | `.trust-faces` (`profile-header.tsx`)                                 |

## Documentation

- `MenuButton`'s comment example passes `aria-label`; the prop is `label`
  (`packages/react/src/components/menu-button.tsx`).
