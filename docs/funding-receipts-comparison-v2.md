# Funding Receipts: Three Options Compared

**Status:** Discussion draft for team review (v2 — rewritten to address objectivity issues in v1)
**Date:** 2026-05-19
**TL;DR:** Three options are on the table for recording off-platform funding events on Certified:

- **Option A — `org.hypercerts.funding.receipt`.** Single-record log in the lexicon family we already use. Recipient writes a record; trust rides on the writer's PDS signature and (optionally) an off-platform `transactionId` an auditor can verify on the underlying rail.
- **Option B — `attested.network`.** Draft community spec covering records, XRPC methods, payment-servicer discovery, and three-party (payer / recipient / broker) cryptographic attestation.
- **Option C — Hybrid.** `funding.receipt` as the data shape, with an optional `signatures` field that allows badge.blue–style cryptographic counter-signatures when a verifier needs them. Same primitive as B's core, without B's protocol surface or broker assumption.

The recommendation in §10 is to ship A first and treat C as the v2 path the moment a verifier appears. That recommendation depends on assumptions named explicitly in §10 — if any of them don't hold, the call should flip. §11 sketches what the work looks like if the team picks B or C instead, so the comparison isn't asymmetric on completeness.

**Response shape (§9):** propose shipping `org.hypercerts.funding.response` rather than reusing `org.hypercerts.context.acknowledgement`. This is a separate decision from A/B/C and applies to whichever record shape ends up carrying the funder-acknowledges affordance.

---

## 1. What the use case actually is, and what we don't yet know about it

What we want to support: a user, group, or project records that money moved — a grant landed, a sponsor paid, a donation came in — and that record surfaces on the relevant profile/project page in a way other people can browse. The payment itself happens off-platform (Stripe, GitHub Sponsors, Gitcoin, wire, on-chain).

What we don't yet know — and the recommendation depends on this — is **who consumes these records, and what they need to believe before acting on them**:

- If the audience is *profile chrome and human readers*, a self-reported receipt with a `transactionId` an auditor can spot-check is structurally sufficient.
- If the audience includes *grant programmes auditing fund flow, transparency dashboards, retrofunding systems, or compliance teams at larger funders*, self-reported receipts may not clear their bar — they may require cryptographic counter-signature from the payer or an independent third party.
- If we ourselves plan to *broker payments on-protocol*, we need an end-to-end payment protocol, not a receipt format.

§7 lays out reasons on both sides of the "what bar will counterparties require" question without trying to settle it.

## 2. Option A — `org.hypercerts.funding.receipt`

One lexicon, one record type, no XRPC. From `hypercerts-org/hypercerts-lexicon/lexicons/org/hypercerts/funding/receipt.json`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `from` | union(text \| DID \| strongRef) | no | Sender identity. Free-text supported for "Acme Corp" without a DID. |
| `to` | union(text \| DID \| strongRef) | yes | Recipient identity. |
| `amount` | string (≤ 50) | yes | Numeric string. Decimal-safe. |
| `currency` | string (≤ 10) | yes | ISO 4217 or token symbol — `USD`, `EUR`, `ETH`, `USDC`. |
| `paymentRail` | string (≤ 50) | no | `bank_transfer`, `onchain`, `stripe`, `github_sponsors`, … |
| `paymentNetwork` | string (≤ 50) | no | `ethereum`, `base`, `sepa`, `ach`. |
| `transactionId` | string (≤ 256) | no | Tx hash, Stripe payment intent, wire ref. |
| `for` | strongRef | no | Link to the project / activity / hypercert this funded. |
| `notes` | string (≤ 500) | no | Free-text context. |
| `occurredAt` | datetime | no | When the payment actually happened. |
| `createdAt` | datetime | yes | When the record was written. |

**Trust model.** ATProto repo signature: the record sits in the writer's PDS, signed via the repo's MST root. The writer (commonly the recipient) carries the claim. `from`'s text form allows the payer to be off-Bluesky.

**Strengths.**
- One record per payment, written via one `createRecord` call. No coordination with the payer required.
- `for: strongRef` is what causes "$5k from Acme" to surface on a referenced project page.
- Rail-agnostic by construction. Stripe, GitHub Sponsors, wire, on-chain — same record shape; `paymentRail` is a string.
- Lives in the same lexicon repo as our `app.certified.*` types, so governance, release cadence, and indexer registration are already in place.

**Weaknesses.**
- The recipient can write any `from` they like. Trust rests on the writer's reputation plus an optional `transactionId` an auditor can verify on the underlying rail.
- No payer signature. A verifier who doesn't trust the recipient or our host has no cryptographic recourse from inside the protocol.
- Subscription / recurring semantics fall out as N separate records, not as a single commitment record. Multi-tranche grants ("$50k disbursed over 4 quarters") read as four loose receipts unless the UI re-aggregates them.
- No payment initiation. If we ever want in-app checkout, this lexicon doesn't carry it.

## 3. Option B — `attested.network`

A draft community spec by Nick Gerakines (also the author of badge.blue) for cryptographically-verifiable proof of payments on ATProto. Four lexicons + three XRPC methods + payment-servicer discovery + three-party attestation.

**Four lexicons.**

| NSID | Purpose |
|---|---|
| `network.attested.payment.oneTime` | Single transaction record. Fields: `subject`, `amount`, `currency` (ISO 4217), `txnid`, `memo`, `createdAt`, `entitlements`, `signatures`. |
| `network.attested.payment.recurring` | Subscription commitment with `unit` (monthly/quarterly/…) and `frequency`. Immutable — to change terms, cancel + recreate. |
| `network.attested.payment.scheduled` | Fixed payment series (2–60 payments), auto-terminates on completion. |
| `network.attested.payment.proof` | Remote attestation records stored in creator's and broker's repos. |

**Three XRPC methods.**

| Method | Purpose |
|---|---|
| `network.attested.payment.initiate` | Payer's client calls a payment servicer (discovered via the recipient's DID document `#AttestedNetwork` service endpoint), passes a `product` ID, gets back a `token` + `url`. |
| `network.attested.payment.status` | Poll with `token` → `pending` / `completed` / `failed`; on success, returns a strongRef to the completed payment record. |
| `network.attested.payment.lookup` | Filter verified payments by payer / recipient / type / broker / entitlements. |

**Three-party attestation.** Payer writes the payment record; recipient writes a `payment.proof` attestation; broker (the payment servicer that processed the rail) writes an independent `payment.proof`. Verification uses badge.blue's CID-first dance: strip `signatures`, inject `$sig` metadata with the repo DID, DAG-CBOR serialise, SHA-256, CIDv1; then fetch the proof records via strongRef and confirm CIDs match.

**Three trust models the consumer can adopt.**
- **Strict.** Require both creator and a specific trusted broker proof.
- **Creator-trusted.** Accept any payment the creator attested. Doesn't require a broker.
- **Federated.** Accept proofs from a set of trusted brokers — enables regional networks and is the realistic middle ground for consumers who don't run a broker themselves.

**Strengths.**
- Payer and (optionally) broker counter-signatures mean a verifier doesn't have to trust the recipient or the host. The signature checks against pinned keys, off-platform.
- Recurring and scheduled payments are first-class records, not implicit from N receipts. The commitment relationship between disbursements is encoded directly.
- Federated trust mode allows Certified to *consume* broker proofs from existing payment processors without operating a broker ourselves — meaningfully cheaper than the Strict-mode reading that requires being a broker.
- If we ever want in-app payment initiation, the XRPC surface is already designed for it.

**Weaknesses.**
- No reference broker. Strict mode requires either being one (regulatory and operational commitment) or partnering with one that already speaks the protocol. Federated mode requires at least one broker we can consume from to exist.
- Draft status. The spec is under community discussion; adopting it now means tracking changes.
- No published JS/TS SDK. Spec explicitly leaves implementation details to implementors. Building one is bounded work but it's work we'd do.
- No PKI guidance — broker key distribution and rotation are unspecified.
- New namespace (`network.attested.*`) outside our existing lexicon family. New governance, separate release cadence.
- Payer participation required: payer's client writes the `oneTime` record. Payers off-Bluesky can't participate.

## 4. Option C — Hybrid: receipt + optional badge.blue signatures

This option keeps `funding.receipt` as the data shape and layers in an *optional* cryptographic signature path when a verifier asks for one. The primitive being borrowed is the badge.blue CID-first attestation — the same primitive at attested.network's core — minus the rest of attested.network's protocol.

**Two compatible mechanisms.**

1. **Inline signatures on the receipt.** Add an optional `signatures: array` field. At write time: build the body, strip `signatures`, inject `$sig` metadata with the writer's repo DID, DAG-CBOR → SHA-256 → CIDv1, sign with the writer's repo-signing key, embed inline. Records without signatures still parse and render — the field is a no-op for unsigned cases.
2. **Remote attestations on counter-signers' repos.** A separate `funding.attestation`-style record on the *signer's* PDS strong-refs the receipt. No change to the receipt lexicon required. Lets third parties sign someone else's receipt.

Inline for self-signatures; remote for counter-signatures.

**Strengths.**
- Funder counter-signature is the genuine prize from attested.network's three-party model, available without attested.network's broker, XRPC, or namespace surface.
- Unsigned receipts work unchanged — the verification path is an opt-in chrome upgrade for audiences that need it.
- Lexicon family stays coherent (we own the hypercerts repo).
- Reversible: if signatures don't get used, the field is dormant and costless to drop later.
- Rail-agnostic — inherits this from the receipt shape.

**Weaknesses.**
- Carrying cost is real even when unused: bundle weight for crypto code, key resolution against DID documents, PLC log walking for historical keys, a verification path we have to operate correctly or not ship at all.
- No XRPC payment-initiation surface, so if in-app checkout becomes a goal, this option doesn't grow into it the way B does.
- Recurring/scheduled semantics are still N-receipts. The signature primitive doesn't fix that.
- No standard discovery for who's a credible counter-signer. Each consumer picks who they trust by DID, ad hoc.
- Inline signatures on every receipt would inflate the records noticeably; the realistic default is "sign only when needed" — which means consumers still see a mix of signed and unsigned records and need a UX for "this one is verifiable, this one isn't."

## 5. Trust comparison

| Question | A: receipt | B: attested.network | C: hybrid |
|---|---|---|---|
| Who signs "$X moved from A to B"? | Writer (typically recipient) via repo signature. | Payer + recipient + (optionally) broker, per-record ECDSA. | Writer via repo sig; optionally payer/third-party via badge.blue. |
| Can a recipient fake a `from`? | Yes; mitigated by `transactionId` audit on the rail. | No (Strict mode) — broker won't sign without a real payment. | Yes for unsigned; no for receipts with a payer signature. |
| Does an off-platform verifier need to trust our host? | Yes (or walk the MST chain). | No — signatures verify offline. | Only for unsigned receipts; signed ones verify offline. |
| Does the payer need to be on Bluesky? | No (free-text `from`). | Yes (payer writes the record). | No for unsigned; yes if the payer is the one signing. |
| Do we need a broker to exist? | No. | Strict: yes. Federated: at least one broker we trust. Creator-trusted: no. | No. |
| Recurring / scheduled as first-class records? | No (N receipts). | Yes. | No (N receipts). |

## 6. Cost and effort — itemized rather than estimated

The v1 of this doc claimed "hours" vs. "months" without sourcing it. The relative ordering is right but the absolute numbers were not defensible. Here is the work itemized so the team can judge.

**Option A — receipt.**
- 1 collection added to `ALLOWED_WRITE_COLLECTIONS` in `src/app/api/xrpc/[...method]/route.ts`.
- 1 helper in `src/lib/atproto/` (createReceipt, listReceiptsFor, deleteReceipt) with rate-limiting registered.
- 1 indexer fan-in query: `appHypercertsFundingReceipt(where: {for: ...})` for the project-side view; `(where: {to: <did>})` for the profile-side view.
- 1 render component (receipt card).
- Optional UI work for the §8 strengthening hooks (rail-aware `transactionId` link-out).
- If we also ship `funding.response` (§9): an additional lexicon + helper + indexer query + UI surface. That work is independent of the A/B/C decision.

**Option B — attested.network.**
- Adopt 4 lexicons in `ALLOWED_WRITE_COLLECTIONS`.
- Implement (or stub and fail-soft) 3 XRPC methods.
- Either build a broker (KYC, AML, regulatory posture, rail integrations — bounded but substantial) **or** identify at least one external broker we trust and consume their proofs (much smaller — closer to "ingest signed records from a known DID").
- Key resolution against DID documents (shared with C).
- CID-gen + DAG-CBOR + ECDSA verify path in the client (shared with C).
- Polling client for `payment.status`.
- Fallback rendering for unproved records.
- DID-document `#AttestedNetwork` service endpoint if Certified profiles act as recipients.

**Option C — hybrid.**
- Receipt path is identical to Option A.
- Add optional `signatures` field to the receipt lexicon (upstream PR — we own it).
- Optionally: define `funding.attestation` for third-party counter-signatures.
- Key resolution against DID documents (shared with B).
- CID-gen + DAG-CBOR + ECDSA verify path in the client (shared with B).
- UI affordance for "verified" vs. "unverified" receipts.

**Reading.** A is bounded by a small file count. C is A plus a verification path that can be lazy-loaded and used only when a counter-signature shows up. B is C plus the protocol surface (XRPC, recurring/scheduled lexicons, servicer discovery) and either being or trusting a broker. The relative ordering (A < C < B) is robust; the absolute time depends on the team's familiarity with badge.blue's verification dance.

## 7. The threat-model question this doc does not try to settle

The disagreement between A and B/C comes down to: **will the counterparties consuming our funding records require cryptographic counter-signature, or will self-reporting + transactionId audits suffice?** This is unknown today, and the recommendation hinges on it. Both directions have plausible support.

**Reasons the bar will stay low (favors A).**
- Many published transparency reports and impact dashboards today consume self-reported funding flow with no cryptographic backing.
- The combination of named funder + `transactionId` + project reputation is, in practice, what auditors check.
- Funders named in fabricated receipts have incentive to call them out; recipients have incentive to keep records honest because their reputation is at stake.
- Cryptographic counter-signature on ATProto is not yet a widely-deployed pattern outside badge.blue; counterparties haven't been trained to expect it.

**Reasons the bar will rise (favors C, and eventually B).**
- Grant programmes routinely audit fund use; some compliance teams may not accept self-reported receipts as primary evidence.
- DAOs, foundations, and public-goods funders publishing transparency reports benefit from a host-independent trust path.
- Tax authorities in some jurisdictions care about funding-flow attestation.
- Third-party reputation systems (impact scoring, retrofunding) become more credible the harder their inputs are to forge.
- The badge.blue / attested.network pattern is being actively developed by people we have ecosystem contact with; if it standardises, counterparties may come to expect it.

This is a genuine uncertainty. The recommendation in §10 picks a default given that uncertainty; the picker should be the team, not this document.

## 8. Side-by-side — all three options

| Dimension | A: receipt | B: attested.network | C: hybrid |
|---|---|---|---|
| Scope | One record. | Records + XRPC + servicer discovery + 3-party attestation. | Receipt + optional signatures. |
| Status | Live in the canonical lexicon repo. | Draft, community discussion. | A's record is live; signature field is an upstream PR. |
| Rails covered | Any (`paymentRail` is a string). | Whatever a broker supports. Federated mode broadens this. | Any. |
| Payer participation required | No. | Yes for record creation; no if recipient writes proof-only flow. | No for unsigned; yes if payer signs. |
| Recurring / scheduled | N records. | First-class. | N records. |
| Counter-signed by payer | No. | Yes. | Optional. |
| Counter-signed by broker | No. | Yes (Strict/Federated). | Optional via remote attestation. |
| Trust if host is hostile | Falls back to MST chain or `transactionId` audit. | Holds (offline signature verify). | Holds for signed receipts; falls back to A for unsigned. |
| Trust if payer is unreachable | OK (free-text `from`). | Limited (payer originates the record). | OK for unsigned; signed receipts need the payer (or a third-party signer). |
| Broker required | No. | Strict/Federated: yes. Creator-trusted: no. | No. |
| Time-to-first-receipt | Smallest. | Largest. | A's path + optional crypto path. |
| Operational surface | None we don't already have. | Broker relationship or being one; key rotation; polling. | Key-resolution code; nothing operational. |
| Lexicon family alignment | Same repo as our existing lexicons. | New namespace, separate governance. | Same repo (signature field is in-family). |
| Ecosystem adoption today | Used by hypercerts.org and related projects (exact adoption not quantified). | One known implementation context (the spec itself). | None — option exists by composition. |

## 9. Response lexicon — `org.hypercerts.funding.response` (proposed, but a separable decision)

This decision is *orthogonal* to A/B/C: whichever record shape carries the funding claim, a funder-acknowledges affordance is useful. Two candidates.

**Option 1: `org.hypercerts.context.acknowledgement` (already shipped, generic).**
`subject: strongRef`, `acknowledged: boolean`, optional `context: union(uri | strongRef)`, optional `comment: string ≤ 1000 graphemes`, `createdAt`. Lives on the acknowledging actor's PDS. Works out of the box for "funder confirms this receipt names them correctly."

**Option 2: `org.hypercerts.funding.response` (new — we ship it).**
Domain-specific record paired with `funding.receipt`, in the same pattern as `badge.award` ↔ `badge.response`.

**Trade-offs both ways.**

*In favor of generic (Option 1):*
- Zero new lexicon work; it's already shipped.
- Keeps the `*.response` design space open for genuinely novel cases later.
- Avoids the cost of two near-identical lexicons (generic and domain-specific) coexisting.

*In favor of domain-specific (Option 2):*
- ATProto convention favors specific over generic (`feed.like`, `feed.repost`, `graph.follow` — not a generic `bsky.reaction`). Indexers, notification routing, and permissioning are easier to target per record type.
- Discoverability for other ATProto apps that adopt the hypercerts namespace — the receipt ↔ response pairing is findable in the lexicon, not buried in our client code.
- A purpose-built field like `correction: strongRef` (the funder writes their own corrected receipt and refs it back) is hard to express on a generic acknowledgement.
- We maintain `hypercerts-org/hypercerts-lexicon`, so adding a lexicon doesn't cost governance overhead we'd otherwise pay.

**The decision is closer than v1 of this doc made it sound.** Option 1 has real merit: it ships today, it works, and proliferating near-duplicate lexicons is a real cost in the ATProto ecosystem. The argument for Option 2 hinges on (a) believing the `correction: strongRef` affordance matters enough to justify a domain-specific record, and (b) trusting that ATProto's "specific over generic" convention is correct in the limit.

**Tentative recommendation: Option 2**, on the grounds that the `correction` field is the load-bearing differentiator and that we are the lexicon's maintainer. **Reasonable to land on Option 1** if the team prefers conservatism with the lexicon surface. Both are defensible.

### Proposed schema (if Option 2 wins)

```json
{
  "lexicon": 1,
  "id": "org.hypercerts.funding.response",
  "defs": {
    "main": {
      "type": "record",
      "description": "Response from a party named in a funding receipt — acknowledging or disputing the claim. Written on the responder's PDS.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["receipt", "acknowledged", "createdAt"],
        "properties": {
          "receipt": {
            "type": "ref",
            "ref": "com.atproto.repo.strongRef",
            "description": "Strong ref to the org.hypercerts.funding.receipt being responded to."
          },
          "acknowledged": {
            "type": "boolean",
            "description": "true = confirm the claim, false = dispute it."
          },
          "correction": {
            "type": "ref",
            "ref": "com.atproto.repo.strongRef",
            "description": "Optional strong ref to a corrected funding.receipt on the responder's own PDS."
          },
          "comment": {
            "type": "string",
            "maxLength": 10000,
            "maxGraphemes": 1000
          },
          "signatures": {
            "type": "array",
            "items": { "type": "unknown" },
            "description": "Optional inline signatures per the badge.blue spec. Unsigned responses still parse."
          },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

### Default visibility

`badge.response` runs default-show (no response → visible). For funding receipts the defaults should split by surface:

- **Recipient's profile / project page** — default-show. The receipt lives on the recipient's PDS; their reputation backs it.
- **Funder's profile** (fan-in over `from.did = me`) — **default-hide.** Anyone could write `from: <some_did>`; default-show would mean people get spammed with claimed-funding attached to their profiles. Surfacing on the funder side requires `acknowledged: true` on the funder's PDS. Disputed receipts (`acknowledged: false`) optionally render with a "Disputed by funder" indicator on the recipient side.

This is a product choice; it's defensible but not the only call. An alternative is *default-hide on both sides until acknowledged*, which is more conservative and less prone to "Vitalik funded me" feed pollution. Worth a product opinion.

## 10. Recommendation (this is a recommendation, not a derivation)

**Default: ship Option A first; treat Option C as the v2 path; treat Option B as a watch-list item.** Ranked reasons:

1. **A is the smallest surface that meets the known-today requirement** (record off-platform funding so it appears on profiles/projects). C and B are larger only if a verifier we don't yet have requires more.
2. **C and B both share badge.blue's verification primitive**, so if/when we add cryptographic counter-signature, the engineering investment is reusable across them.
3. **A and C share the same on-disk record shape**, so the migration from A → C is additive (new optional field, new optional records) rather than substitutive.
4. **B's distinguishing surface (XRPC + recurring/scheduled lexicons + payment-servicer discovery) is only valuable if we want to broker payments on-protocol or care strongly about first-class subscription semantics.** Neither is currently scoped.
5. **A is in our existing lexicon family.** B isn't. This is a real but limited cost — lexicon family fragmentation matters at scale, not at one new namespace.

**Assumptions this recommendation depends on. If any fail, reconsider:**

- **A1.** The audience for Certified funding records is, for the next 6–12 months, dominated by human readers + spot-checking auditors, not by programmatic compliance pipelines that require cryptographic proof.
- **A2.** No specific grant programme or funder currently engaged with Certified has signaled that self-reported receipts won't clear their bar.
- **A3.** Subscription/recurring semantics ("$50k over 4 quarters") are an acceptable UX as a fan of N receipts re-aggregated by the client, not as a first-class commitment record.
- **A4.** We are not planning, within the recommendation's horizon, to broker payments on-protocol — i.e., we are not Certified-as-payment-platform, we are Certified-as-receipt-ledger.

If **A1 or A2** fails, jump to Option C: add the optional `signatures` field, define `funding.attestation`, ship the verification path. The work is itemized in §6.

If **A3** fails meaningfully (e.g., a grant programme commits to a multi-tranche disbursement schedule and wants the commitment encoded), it's worth re-reading B's recurring/scheduled lexicons rather than overloading the receipt shape.

If **A4** flips, the receipt isn't the right primitive and the analysis restarts from B.

## 11. What the work looks like under each option

Including this so the comparison isn't asymmetric on completeness. The recommendation chooses Option A; the team should know what B and C cost as alternatives.

**If we pick A.**
- Allowlist `org.hypercerts.funding.receipt`.
- `src/lib/atproto/funding-receipt.ts` (create / list / delete; rate-limit registered).
- Indexer fan-in queries (project-side and profile-side).
- Receipt card render component; profile-page surface; project-page surface.
- §8-style pragmatic strengthening: render `transactionId` as a rail-aware link; allow payer-side counter-receipt via `from: DID`; ship the §9 response lexicon for funder acknowledgement.

**If we pick C.**
- Everything in A.
- Upstream PR adding optional `signatures: array` to `funding.receipt`.
- Optional `org.hypercerts.funding.attestation` lexicon for third-party counter-signatures.
- Client crypto path: DID document resolution, PLC log walking for historical keys, DAG-CBOR + SHA-256 + CIDv1 + ECDSA verify.
- UI affordance distinguishing verified from unverified receipts.

**If we pick B.**
- Allowlist `network.attested.payment.{oneTime,recurring,scheduled,proof}`.
- Implement (or stub with explicit fail-soft) the three XRPC methods.
- Decide: be a broker, or pick a federated set of brokers to consume from. The first is substantial regulatory/operational commitment; the second is closer to "consume signed records from a known DID."
- Client crypto path (same as C).
- DID-document `#AttestedNetwork` service endpoint configuration for Certified profiles.
- Polling client + status UX for in-flight payments.
- Track spec churn until it exits draft.

## 12. Open questions for the meeting

1. Who is the audience for funding records on Certified, today and in the next 12 months? Are they primarily human readers and spot-checking auditors, or are there programmatic consumers (grant compliance, retrofunding, transparency dashboards) we want to support?
2. Does anyone on the team have a concrete funder or grant programme in mind whose compliance posture we'd need to accommodate within 6–12 months? If yes, that pushes toward C.
3. Are first-class subscription / multi-tranche semantics a real product need, or is "fan of N receipts re-aggregated by the UI" acceptable?
4. Do we have a position on Certified ever brokering payments on-protocol — yes, no, or "deliberately undecided"?
5. Is the `funding.response` decision in §9 worth its own thread, or do we accept the tentative recommendation (Option 2 — domain-specific) and move on? Either resolution is workable.
6. On the funder-profile visibility default (recipient default-show, funder default-hide): is the asymmetric default the right ratio, or should both sides default-hide until acknowledged?
7. If we ship A and watch attested.network mature, what would the migration to C (or even B) cost later, and is anyone willing to own the watch?

---

**Sources**
- `hypercerts-org/hypercerts-lexicon/lexicons/org/hypercerts/funding/receipt.json`
- `attested.network` (draft community spec by Nick Gerakines, built atop badge.blue's CID-first attestation framework)
- `badge.blue` (spec page; the CID-first attestation primitive)

**Change log from v1**
- TL;DR rewritten to name three options as peers; no preferred-option framing in the lede.
- Hybrid (Option C) elevated from a buried §9 to a first-class option in §4, present in every comparison table.
- §3 (Option B) rewritten with symmetric strength/weakness enumeration and explicit treatment of Federated trust mode.
- §6 replaces unsourced "hours vs. months" with itemized work for each option.
- §7 ("Threat-model question") replaces v1's dismissive §4 reframe; both directions presented without resolution.
- "Objective argument" renamed to "Recommendation" and made explicit about resting on named assumptions.
- §11 adds parallel work plans for B and C so the comparison is symmetric on completeness.
- §9 (response lexicon) gives Option 1 (generic) genuine air-time rather than treating it as a foil; recommendation softened to "tentative."
- Open questions reworded to be answer-neutral.
