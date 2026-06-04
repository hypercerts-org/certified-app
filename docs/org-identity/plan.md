# Org-identity aggregation — plan & decision log

**Branch:** `feat/org-identity-aggregation` → Draft PR into `staging`
**Bug that motivated it:** a user didn't see the projects he manages, because
he manages them only *via groups he belongs to*. Records authored by a group
live in the group's repo (its own DID), so they never appeared on his
personal surfaces.

## The model (decisions)

The core question was: *treat a group as a separate actor, or fold it into
the individual's UX?* We chose a **hybrid** — read-aggregate, write-explicit:

1. **Read-aggregation is the spine.** Aggregate records owned by the groups a
   user **owns or admins** onto their work surfaces, each tagged "via
   {group}". Built in three places: a dedicated **`/managed` hub** (focus
   filter), **inline on Home** (My projects / My activities), and a
   dismissible **bridge banner** on the user's own profile. (GitHub/Linear
   pattern: your work + the orgs you run, in one place.)
   - **Member-role groups are excluded.** Membership alone doesn't grant the
     responsibility that owner/admin do. Enforced in `ownedOrAdminGroups`.
   - **Identity/public surfaces stay single-identity.** A public profile is
     one actor; group projects are NOT folded into its Projects tab — the
     bridge links out instead.

2. **Write identity is per-action, explicit.** The old "acting as" bar
   conflated read-scope and write-identity, which is how a user could post
   under a group unintentionally. Now:
   - **`<PostingAs>`** picker on every create/edit/respond action. Default is
     **You**; switching to a group is deliberate. High-stakes actions
     (endorse, award) require a **confirm** that names the parties.
   - **"Acting as" is demoted to read-scope / focus only.**
   - Edits write back to the **record-owner repo** (`editTargetDid`), so a
     group record stays group-owned after an edit.
   - The endorse-as-org backend already existed (`writeToRepo(targetDid)`);
     we wired the picker to it rather than rebuilding.

3. **Notifications aggregation is flag-gated, pending an indexer change.**
   The notifications op is scoped by the service-auth JWT `iss`, so a group's
   notifications can't be read from the client alone. We built the full
   client (`recipients` plumbing, identity filter, "via {group}" rows,
   aggregated badge) behind `NEXT_PUBLIC_NOTIFICATIONS_AGGREGATION` (default
   OFF) and wrote the exact indexer contract:
   `docs/org-identity/indexer-notifications-aggregation.md`. With the flag
   off, every notifications path is byte-identical to before.

## Surfaces (per-surface decision)

| Surface | Treatment |
| --- | --- |
| Home (My projects / activities) | inline aggregation + "via {group}" |
| `/managed` hub | full aggregation + identity focus filter |
| Own profile | single-identity + dismissible bridge banner |
| Foreign profile | single-identity, no bridge (never advertises a viewer's groups) |
| Explore | unchanged (network-wide; aggregation is about *your* responsibility) |
| Create / edit | `<PostingAs>` write picker |
| Notifications | aggregation behind the flag (identity filter + via rows) |

## Out of scope (deliberately)

- **Group "seen"/read-state for notifications.** That's shared team state
  (one admin clearing the badge for all). Phase 2; documented in the indexer
  spec §6. The aggregated badge is informational; mark-seen stays personal.
- **Writing to a group you don't own/admin.** The picker only offers
  owner/admin groups.
- **Folding group records into the public profile.** Intentional — keeps the
  profile one public actor.

## Rollout / rollback

- Read-aggregation + write-reframe ship on merge (no flag).
- Notifications aggregation stays dark until the magic-indexer `recipients`
  change lands; then flip `NEXT_PUBLIC_NOTIFICATIONS_AGGREGATION` on a preview
  env, verify against real data, then staging, then prod.
- Rollback: the notifications slice is a flag flip. The read-aggregation is
  additive (new hub + new rows); reverting the Home/profile changes restores
  the personal-only surfaces.

## Verification

- Gate: typecheck 0, lint 0 errors, 600 tests, build OK.
- Browser (Playwright, auth-mock preview harness): `/managed` hub (light +
  dark + mobile), Home inline aggregation, own-profile bridge, create
  `<PostingAs>` picker, notifications aggregation (filter, via rows,
  read-only group rows, member-group exclusion, aggregated badge) — all with
  fixture data via the `managedScenario` mock.
