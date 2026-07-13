# Cross-repo follow-ups: dissolved by live schema probing (2026-07-13)

The pass recorded three "needs magic-indexer changes" follow-ups. Probing the
deployed prod indexer (`magic-indexer-prod.up.railway.app/graphql`; introspection
is disabled, so probed with real queries) showed none of them need upstream work:

1. **`where: { uri: { in } }` on `orgHypercertsCollection`** — works today: a
   probe with a real collection URI returned the exact node. Corroborated by
   `ActivitiesByUris`, which has shipped on the same filter shape all along.
   The Ma Earth loader's PDS fallback is kept as defense-in-depth for dev /
   self-hosted indexers; its "may not be supported" comment was corrected.
2. **`avatar` on collection nodes** — already in the deployed schema (validates
   and resolves; magic-indexer builds its GraphQL schema from lexicon
   definitions, so record fields flow through generically). 0/100 sampled
   collections have avatars because the *records* don't (verified against the
   PDS for 30 of them) — not an ingestion gap. The real gap was app-side:
   `Projects` / `UserProjects` / `ProjectsContainingCert` didn't *select* the
   field. Fixed in this branch — all collection ops now select `avatar`, so
   `projectImage`'s avatar-first thumb precedence takes effect on indexer-fed
   surfaces as soon as records carry avatars.
3. **`authorLabels` on `CollectionsByUris`** — the argument validates on the
   same connection (and `ActivitiesByUris` combines `uri:{in}` with label args
   in production). Wiring it is app-side; whether the Ma Earth curated list
   *should* respect the org-quality filter is a product decision, left with
   the documented "ignored by design" behavior.

Net: no magic-indexer issues filed; one app-side commit
(`perf(projects): select avatar in all collection ops`) closes item 2.
