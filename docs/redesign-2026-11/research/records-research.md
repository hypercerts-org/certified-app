# Records page research (certified.app `/records`)

Help-centre pages are maintained docs, so they show current behaviour. A few older sources still apply: NN/g (2018, 2021), Linear undo (2020) and Google's Drive change (2020–22). "(judgement)" means no direct source.

## 1. Folder vs tag model

How it works today: a project lists activities in `items[].itemIdentifier.uri`, and one activity can be in several projects. So the folder view shows an activity under every project that holds it, and "Without a project" is a bucket the page works out.

- Treat projects as albums, not folders: you add an activity to a project, it never moves. Google stopped letting a file sit in several folders because it caused "confusion about how files and folders are owned, managed, and updated" (Google Drive Help, https://support.google.com/drive/answer/10864219). In Apple Photos one photo can be in many albums: drag the selection onto an album, or Control-click › Add To (Apple Photos Guide, https://support.apple.com/guide/photos/pht6d60a1f1/mac). Are.na blocks "can also be connected to an infinite number of channels" (https://help.are.na/docs/getting-started/blocks).
- Don't copy Linear. There, "Issues can only be associated with one project at a time" (https://linear.app/docs/projects), which is what keeps a tree accurate. certified.app doesn't have that rule.
- Show an activity's projects as chips on its row, for example the first name plus "+1". Linked-record cells do this (Notion, https://www.notion.com/help/relations-and-rollups; Airtable, https://support.airtable.com/docs/linking-records-in-airtable), and Linear can show the project on each row (https://linear.app/docs/display-options).
- Keep "Remove from project" separate from "Delete" and make clear it deletes nothing. In Drive, "Deleting shortcuts won't delete the original file" (Google, above).
- Make "Not in a project" a filter value instead of a folder (judgement).

## 2. Multi-select, bulk actions, adding to a project, undo

- Show each row's checkbox at its left edge on hover or focus, and always on touch (Linear, https://linear.app/docs/select-issues; Dropbox, https://help.dropbox.com/organize/select-multiple-files; Carbon, https://carbondesignsystem.com/components/data-table/usage/).
- Support Shift-click for a range, Esc to clear, and Cmd/Ctrl+A to select the whole filtered list (Linear, above).
- Once a row is selected, show a bar with the count, the actions and Cancel. Turn off row actions while it is open (NN/g, https://www.nngroup.com/videos/bulk-actions-design-guidelines/; Carbon; Google Drive, https://support.google.com/drive/answer/13318592).
- Label actions verb + noun: "Add to project", "Delete activities" (Shopify Polaris, https://polaris.shopify.com/components/index-table).
- Make "Add to project…" a picker with search and one checkbox per project:
  - Tick to add, untick to remove.
  - Show a mixed checkbox when only some selected activities are in that project.
  - End the list with "New project from selection".
  - Sources: GitHub star lists (https://docs.github.com/en/get-started/exploring-projects-on-github/saving-repositories-with-stars); Figma's searchable "Move [X] Files" picker (https://help.figma.com/hc/en-us/articles/360038511573); Apple Photos "New Album with Selection".
- Add dragging only later, as a shortcut. WCAG 2.2 SC 2.5.7 (AA) requires a non-drag way, such as "select, then act" (https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html). NN/g says menus "can be less error-prone" on mobile (https://www.nngroup.com/articles/drag-drop/).
- Apply add and remove at once, with an "Undo" toast. Confirm only deletes: name what goes, and use outcome labels like "Delete 3 activities" / "Keep" (NN/g, https://www.nngroup.com/articles/confirmation-dialog/; Linear, https://linear.app/changelog/undo-actions).

## 3. Row design

- Use a list with one fixed row height for every kind. Lists suit items with few properties, and a gallery "puts visuals front-and-center" (Notion, https://www.notion.com/help/guides/when-to-use-each-type-of-database-view). Pick one density, for example 48 px rows (64 px with two lines of text), and don't mix (Carbon).
- Let the thumbnail and title open the record (Polaris).
- Activity row, left to right: checkbox · 40 px thumbnail · title over a meta line (dates · location) · project chips · contributor avatars · ⋯ menu.
- For another account's activity, show "by @handle" with no Edit or Delete (as now).
- Show at most two actions on the row; Carbon keeps actions on the row only when there are "fewer than three options". Order the ⋯ menu Open, Edit, Contributors…, Add to project…, Add to list…, then a divider and Delete. Make each menu action reachable elsewhere too (Apple HIG, https://developer.apple.com/design/human-interface-guidelines/context-menus).

## 4. Creation

- Add one "New" menu (Activity, Project, List) to the header, listing the current view's kind first (judgement).
- Make "New activity" inside a project add it to that project. In Linear, C in a project view creates an issue there (https://linear.app/docs/projects).
- End the project picker with "New project…" (GitHub, Figma; placement is judgement).
- Skip one-line quick-add for activities, which need title, image, dates, location and contributors. Return to `/records` with the new row highlighted (judgement).

## 5. Contributors

- Show up to four avatars, then "+N". Primer shows "a minimum of 2 Avatars and a maximum of 4" (https://primer.style/components/avatar-stack). Label the group for screen readers ("Contributors: A, B and 3 more") and add a tooltip.
- Add "Contributors…" to the ⋯ menu, opening an `AppDialog`:
  - Reuse `ContributorIdentityField` (handle search via `/api/search-actors`) with role and weight.
  - Save as `src/components/feed/activity-edit-route.tsx` does.
  - Keep strong-ref contributors read-only, as on the edit page.
- Don't edit contributors on several activities at once (judgement).

## 6. Search, filter, sort, empty states, keyboard

- Give each view one search field.
  - Filter chips: Project (including "Not in a project"), Owner (mine or another account's), Year.
  - Sort: Newest, Oldest, Title, Activity date.
  - Linear keeps what a row shows separate from which rows appear (https://linear.app/docs/display-options).
- Support filter → select all → act: adding every 2025 activity to a project takes four steps (Linear).
- Give each kind an empty state that says what's happening, explains the feature and offers the next action. Don't show "nothing here" while loading, and keep "Nothing matches 'x'" distinct from "None yet" (NN/g, https://www.nngroup.com/articles/empty-state-interface-design/).
- Keyboard: arrows or J/K move; Space or X select; Shift+Arrow extends; Ctrl+A, Esc and Enter select all, clear and open (WAI-ARIA APG Listbox, https://www.w3.org/WAI/ARIA/apg/patterns/listbox/; Linear). Announce the selected count to screen readers (judgement).

## 7. Recommendation for /records

**Kinds column** (1100 px and wider; pills below, as now):

1. Activities, with a count.
2. Projects, with a count and project names listed beneath as links (Apple Photos sidebar).
3. Endorsements: Given and Received tabs.
4. Lists.
5. Following and Followers in one entry with two tabs. Name options: "People", "Network", "Connections".

**Activities view.** One flat list with project chips and a Project filter. Selecting rows shows "N selected · Add to project · Add to list · Delete · Cancel".

**Projects view.** One row per project: cover, title, "12 activities", last updated.

- Clicking a project shows its activities in the main area (`?kind=projects&project=<rkey>`), under a header with Open, Edit and "Add activities".
- "Add activities" opens a searchable checkbox list of your activities: the project-edit quick-pick, moved into a dialog.
- Rows offer "Remove from project", one at a time or in bulk.
- This replaces the expanding folders, which show an activity twice when it's in two projects.

**Fewest steps:**

- From Activities: tick the rows → "Add to project" → tick the project. It saves at once, with Undo.
- From a project: "Add activities" → tick the activities → Done.
- Each costs one write per project (rewriting `items`), not one per activity.

**Phone (below 800 px):**

- A "Select" button in the header; long-press also starts selecting (Material, https://m2.material.io/design/interaction/selection).
- The bulk bar sits at the bottom of the screen, and pickers open as bottom-sheet `AppDialog`s.
- The ⋯ menu is always visible, with no dragging.

**Endorsements.** Received rows show "Shown" or "Hidden" in words, with a switch and bulk Hide/Show. Given rows offer Remove.

**Lists.** Keep one home for all lists, filtered by type (activities, projects, accounts). Endorsement lists either move here or are linked from here (judgement). "Add to list…" uses the projects picker, since lists are many-to-many too (GitHub star lists).

**Not verified:** multi-file drag in Figma (forum reports conflict); Readwise Reader documents no bulk tagging; the Apple HIG "Lists and tables" page didn't load.
