# Funding Receipts: `org.hypercerts.funding.receipt` vs. attested.network

**Status:** Discussion draft for team review
**Author:** prepared for the team, 2026-05-19
**TL;DR:** Despite the surface similarity, these two options aren't peers. **Use `org.hypercerts.funding.receipt`.** It's a single record for *logging that a payment happened*. attested.network is a draft *payment protocol* (initiate / status / lookup, brokers, servicer discovery, three-party attestation) that turns us into a payment platform. Until we actually want to *broker* payments on-protocol, the receipt is the right tool and the protocol is a 10× scope increase we don't need. This stance is revisited in §9 — the cryptographic primitive at attested.network's core (badge.blue's CID-first signatures) can be layered onto the receipt without the rest of the protocol the moment a verifier shows up.

**Response shape (§8):** for the funder-acknowledges-receipt affordance, propose shipping a new domain-specific `org.hypercerts.funding.response` lexicon rather than reusing the generic `org.hypercerts.context.acknowledgement`. We own the namespace, ATProto convention favors specific-over-generic, and the receipt ↔ response pairing should be discoverable to every adopter of the namespace, not just our codebase.

---

## 1. The use case as I understand it

A "funding receipt" on Certified means: a user, group, or project wants to record that money moved — a grant landed, a sponsor paid, a donation came in — and have it appear on a profile/project in a way other people can browse and audit. The payment itself happens **off-platform** (Stripe, GitHub Sponsors, Gitcoin, a wire, an on-chain transfer, a bank). We are not the payment rail. We are the *receipt ledger*.

If that read is wrong — if we actually want to *broker* payments natively, with payment servicer discovery via DID document, in-app payment initiation, and cryptographic chain-of-custody — then the conclusion flips. See §6.

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

Trust model: ATProto repo signature — the record sits in the *writer's* PDS, signed via the repo's MST root. Whoever wrote it (the recipient, in the common case) is on the hook for the claim. `from`'s text form means we don't need the payer to be on Bluesky.

What this gives us:
- **Log it and move on.** Any user/group/project can write a receipt to their own PDS with one `createRecord` call. No coordination with the payer required.
- **`for: strongRef` does the heavy lifting.** A receipt that strong-refs a project's hypercert / activity record is exactly what surfaces "this project received $5k from Acme" on the project page.
- **Cross-rail by design.** Same record shape for a Stripe payment, an on-chain USDC transfer, a wire, a GitHub Sponsors payout. We don't pick one rail and lock in.
- **Same lexicon family we already use.** `org.hypercerts.*` and `app.certified.*` share the `hypercerts-org/hypercerts-lexicon` repo. We're already in their indexer's namespace, already tracking releases, already aligned with their cadence.

What it doesn't give us:
- **No payer signature.** The recipient claims "Acme paid me $5k." Acme didn't sign it. Anyone can write a receipt about anyone. Trust comes from the writer's reputation + the optional `transactionId` that an auditor can independently verify on the rail (etherscan, bank statement, Stripe dashboard).
- **No payment initiation.** This is a log, not a checkout flow.
- **No recurrence model.** Subscriptions are N receipts, not one record with `frequency: monthly`.

## 3. Option B — attested.network

A draft community spec by Nick Gerakines (also the author of badge.blue) for *cryptographically-verifiable proof of payments* on ATProto. The spec is **not just a record shape — it's a full payment protocol.**

Four lexicons:

| NSID | Purpose |
|---|---|
| `network.attested.payment.oneTime` | Single transaction record. Fields: `subject`, `amount`, `currency` (ISO 4217), `txnid`, `memo`, `createdAt`, `entitlements`, `signatures`. |
| `network.attested.payment.recurring` | Subscription commitment with `unit` (monthly/quarterly/…) and `frequency`. Immutable — to change terms, cancel + recreate. |
| `network.attested.payment.scheduled` | Fixed payment series (2–60 payments), auto-terminates on completion. |
| `network.attested.payment.proof` | Remote attestation records (badge.blue style) stored in creator's and broker's repos. |

Three XRPC methods:

| Method | Purpose |
|---|---|
| `network.attested.payment.initiate` | Payer's client calls a payment servicer (discovered via the recipient's DID document `#AttestedNetwork` service endpoint), passes a `product` ID, gets back a `token` + `url`. |
| `network.attested.payment.status` | Poll with `token` → `pending` / `completed` / `failed`; on success, returns a strongRef to the completed payment record. |
| `network.attested.payment.lookup` | Filter verified payments by payer / recipient / type / broker / entitlements. |

Three-party attestation:
1. **Payer** writes the payment record to their repo.
2. **Recipient** writes a `payment.proof` attestation to their repo.
3. **Broker** (the payment servicer that processed the rail) writes an independent `payment.proof` to their repo.

Verification is the badge.blue dance: strip `signatures`, inject `$sig` metadata with the repo DID, DAG-CBOR serialise, SHA-256, CIDv1; then fetch the proof records via strongRef and confirm CIDs match.

Three trust models the consumer can adopt:
- **Strict.** Require both creator and a specific trusted broker proof. Highest assurance.
- **Creator-trusted.** Accept any payment the creator attested. Simpler, lower bar.
- **Federated.** Accept proofs from a set of trusted brokers — enables regional networks.

What attested.network gives us:
- **Counter-signed payments.** A payer can't deny they paid; a recipient can't fabricate a payment without a broker's proof (under Strict mode). This is genuinely stronger than the receipt model.
- **Recurring + scheduled as first-class records.** Subscriptions don't fall out of a fan of N receipts.
- **Off-platform verifiable claims.** Same property badge.blue gives — the trust boundary is "the broker's pinned key," not "the host serving the record." A grant programme could verify "this org actually received funding" without trusting Certified's PDS host.

What it doesn't give us:
- **No JS/TS SDK.** Spec note: "intentionally left to implementors."
- **No PKI guidance.** Who's a broker? Who decides? How are broker keys distributed?
- **No merchant settlement mechanism.** "Left to implementors."
- **No reference broker.** We would either have to *be* a broker (large undertaking — KYC, AML, rail integrations, regulatory), or wait for one to exist that we trust.
- **Draft status.** The spec is explicitly under community discussion. Adopting it now means tracking churn.

## 4. The trust delta (the part that drives the decision)

Different signature shapes mean different trust paths. The right question for picking between them isn't *"which one has more fields?"* — it's *"what does a verifier have to trust to believe the claim that money moved?"* Here's the delta for funding receipts specifically:

| Question | `hypercerts.funding.receipt` | attested.network |
|---|---|---|
| Who signs the claim "$X moved from A to B"? | The writer (typically the recipient) via repo signature. | Payer + recipient + (optionally) broker, via per-record ECDSA. |
| Can a malicious recipient fake a receipt? | Yes — they can write any `from: "Acme"` they want. Mitigation: `transactionId` lets auditors verify on the underlying rail. | No, under Strict mode — they'd need the broker's signature, which a real broker won't issue without an actual payment. |
| Does an off-platform verifier need to trust our host? | Yes (or walk the MST chain, which nobody does). | No — they verify the ECDSA signature against the broker's pinned key. |
| Does the payer need to be on Bluesky? | No — `from` accepts free text. | Yes — payer writes the `payment.oneTime` record. |
| Do we need a broker to exist? | No. | Yes (for Strict / Federated trust). |

Reframe: **attested.network solves "the verifier doesn't trust the recipient OR the host."** That's a real threat in a payment context. In a *credit / portfolio / endorsement* context — which is where funding receipts will surface on Certified — the threat is usually overstated. A funder named in a receipt has every incentive to call out a fabricated receipt; the project being credited has every incentive to make the receipt look real because their reputation depends on it; an auditor (grant programme, journalist, due-diligence team) will follow the `transactionId` to the underlying rail anyway.

## 5. Side-by-side

| Dimension | `hypercerts.funding.receipt` | attested.network |
|---|---|---|
| **Scope** | One record. Log a payment that happened. | Payment protocol (records + XRPC + servicer discovery + 3-party attestation). |
| **Status** | Live in the canonical lexicon repo we already track. | Draft, community discussion. |
| **Rails covered** | Any — `paymentRail` is a string. Stripe, GitHub Sponsors, wire, on-chain, all fit. | Whatever a broker supports. No broker → no rail. |
| **Payer participation required** | No. Free-text `from`. | Yes. Payer's client initiates. |
| **Recurring / scheduled** | N records. | First-class records. |
| **Counter-signed by payer** | No. | Yes. |
| **Counter-signed by broker** | No. | Yes (under Strict / Federated). |
| **Trust if host is hostile** | Falls back to MST chain or `transactionId` audit on the rail. | Holds — signatures verify offline against pinned keys. |
| **Effort to ship the first receipt** | Hours. Allowlist the collection, write a form, render a card. | Months. We'd need a broker (build one or find one), implement initiate/status/lookup, key management, CID-gen + verify path, fallback rendering for unproved records. |
| **Operational surface** | None we don't already have. | New: broker relationships (or being one), key rotation, polling infrastructure, regulatory posture. |
| **Lexicon family alignment** | Same repo as our `app.certified.*` lexicons. | New namespace, different governance. |
| **JS/TS SDK** | N/A — it's one record. | None published. |
| **Maturity in the ecosystem** | Used by hypercerts.org and related projects. | One known implementation context (the spec itself). |

## 6. Objective argument

**Recommendation: `org.hypercerts.funding.receipt`.** Reasoning, ranked:

1. **Scope match.** What we want is a *receipt ledger*. The receipt lexicon is a receipt ledger. attested.network is a *payment protocol*. Picking a payment protocol to solve a record-keeping problem buys us infrastructure we then have to operate, for a verification property our consumers don't yet require.
2. **Lexicon family coherence.** We already depend on `hypercerts-org/hypercerts-lexicon` for `app.certified.badge.*`. Adding `org.hypercerts.funding.receipt` is the same repo, same governance, same release cadence we're already tracking. Switching to `network.attested.*` forks our lexicon dependency.
3. **No broker, no problem.** The receipt model doesn't require a broker to exist. attested.network's stronger trust property requires either *being* a broker (regulatory + ops commitment we shouldn't take lightly) or having one we trust on the protocol. Neither is on the table today.
4. **Cross-rail by construction.** A receipt with `paymentRail: "stripe"` and `paymentRail: "onchain"` is the same record. attested.network's broker model implicitly assumes the broker mediates the rail; mixed rails mean mixed brokers.
5. **The threat model the protocol blocks is mostly notional for us.** "A recipient fabricated a $50k grant" is real. But the obvious mitigations — funder calling it out publicly, auditor checking the `transactionId` — are cheap and already work. We're not currently the system of record for high-stakes funding decisions where an offline cryptographic proof would change behavior.
6. **Draft status is a soft no.** Adopting a draft spec when a stable lexicon in our existing family does the job is paying a churn tax for capability we don't consume.
7. **Honest counter-argument.** If Certified's product evolves into a place where *funders verify recipients' track records to decide on grants*, the asymmetry of "anyone can claim anything" starts to bite. attested.network (or some other counter-signed scheme) becomes interesting at that point. Not today.

**Watch-list trigger to revisit attested.network:** any of (a) we want to *broker* payments on-protocol; (b) a real funder tells us their compliance team won't accept self-reported receipts and needs cryptographic counter-signature; (c) a JS/TS reference implementation lands with at least one credible broker; (d) the spec exits draft. Until then, this is a no-op.

## 7. The receipt's pragmatic strengthening (free, today)

We don't get cryptographic counter-signatures, but we *can* close most of the trust gap without adopting attested.network:

- **Always render `transactionId` when present.** Make the on-rail audit one click away. Stripe payment intent → Stripe dashboard URL; on-chain tx → block explorer; bank wire → screenshot of reference.
- **Optional `from: DID` invites a payer-side counter-receipt.** If Acme is on Bluesky, they can write their own mirror receipt with `to: <project>` from their repo. Two receipts that strong-ref each other approximate counter-signing without any protocol work.
- **Allow funders to acknowledge or dispute a receipt about them.** A profile-side affordance: if someone names me as `from` and I'm on Bluesky, I can write a response record acknowledging or disputing the receipt. The lexicon question — generic `context.acknowledgement` vs. a new domain-specific `funding.response` — is large enough to warrant its own section; see §8.

These three together get most of the assurance benefit at ~10% of the engineering cost. Worth pricing in regardless of which option we pick.

## 8. Response shape — `org.hypercerts.funding.response` (proposed)

The funder-response affordance from §7 needs a response lexicon. There are two candidates, and the right answer changes depending on whether we treat ourselves as consumers of the hypercerts lexicon or as maintainers of it. We are maintainers.

### The two candidates

**Option 1: `org.hypercerts.context.acknowledgement` (already shipped, generic).**
`subject: strongRef`, `acknowledged: boolean`, optional `context: union(uri | strongRef)`, optional `comment: string ≤ 1000 graphemes`, `createdAt`. Lives on the acknowledging actor's PDS. The lexicon's own description explicitly lists *"a record owner acknowledging an evaluation"* as a target use case — structurally identical to "a funder acknowledging a receipt that names them." It would work out of the box.

**Option 2: `org.hypercerts.funding.response` (new — we ship it).**
Domain-specific record paired with `funding.receipt`, in the same mental-model pattern as `badge.award` ↔ `badge.response`. Schema proposed below.

### Why domain-specific wins here

We own `hypercerts-org/hypercerts-lexicon`, so the governance argument that would normally favor the already-shipped generic option dissolves. With governance free, the decision comes down to lexicon-design philosophy, and three considerations point the same way:

1. **ATProto convention favors domain-specific.** `app.bsky.*` is full of `feed.like`, `feed.repost`, `graph.follow`, `graph.block` — separate NSIDs, no generic `bsky.reaction` or `bsky.relation` underneath. The reason: domain-specific records make indexer schemas, notification routing, rate-limiting, and permissioning targetable per record type instead of forcing every consumer to write the same filter glue. A generic `context.acknowledgement` runs *against* the grain of how the ecosystem typically composes records.
2. **Discoverability is a public good now, not just an internal one.** A first-class lexicon makes the receipt ↔ response pairing findable for any other ATProto app that adopts the hypercerts namespace. The wrap-in-a-helper workaround we'd otherwise need only helps our codebase.
3. **Headroom for domain-specific fields.** The funder dispute case "yes, but the amount was $20k not $50k, disbursed in tranches" is awkward to express on a generic record with one free-text `comment`. A `correction: strongRef` pointing at a corrected receipt is purpose-built for it and reuses the receipt vocabulary we already have.

### Proposed schema

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
            "description": "Optional strong ref to a corrected funding.receipt on the responder's own PDS (e.g. the funder writes their own receipt with the actual amount and dates, then refs it here)."
          },
          "comment": {
            "type": "string",
            "maxLength": 10000,
            "maxGraphemes": 1000,
            "description": "Optional plain-text context."
          },
          "signatures": {
            "type": "array",
            "items": { "type": "unknown" },
            "description": "Optional inline signatures per the badge.blue spec. When present, cryptographically binds the responder DID to this response, enabling off-platform verification. Entry shape follows the badge.blue attestation object. See §9 for what this unlocks and when to add it."
          },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

Notes on the shape:
- `receipt` instead of generic `subject` self-documents the link without needing to inspect the strongRef's collection.
- `correction: strongRef` is the new field that justifies a domain-specific lexicon — it lets a funder attach the version they consider correct without overloading `comment`. The funder writes a corrected `funding.receipt` to their own PDS and refs it here.
- `acknowledged: boolean` stays (not `response: string` with knownValues) because the semantics are factual confirmation/dispute, not social visibility.
- `signatures: array (optional)` lets the response carry an inline cryptographic proof when a counterparty needs one. Unsigned responses still parse and render unchanged — the field is a no-op for the common case. §9 covers what this unlocks, when it's worth using, and the relationship to receipt-level signatures.

### Default visibility — don't copy `badge.response`

`badge.response` runs **default-show** (no response → visible on the recipient's profile). For funding receipts the defaults should split by surface:

- **Recipient's profile / project page** — default-show. The receipt lives on the recipient's PDS; they wrote it; their reputation backs the claim.
- **Funder's profile** (fan-in: "all receipts where `from.did = me`") — **default-hide.** Anyone could write `from: <vitalik_did>`; we don't want Vitalik's profile defaulting to 10,000 fake "Funded by Vitalik" receipts. Surfacing requires `acknowledged: true` on the funder's PDS. Disputed receipts (`acknowledged: false`) optionally render with a "Disputed by funder" badge on the recipient side — turns the dispute into a public signal instead of silent suppression.

### Open design call: what happens to `context.acknowledgement`?

If we ship `funding.response`, the existing generic lexicon needs a clearer charter. Two coherent positions:

1. **Demote to fallback primitive.** Charter: "use a domain-specific `*.response` lexicon when one exists; `context.acknowledgement` is the escape hatch for relationship acknowledgements with no domain shape yet." Documented in the lexicon repo README. Conservative — keeps optionality for cases we haven't predicted.
2. **Deprecate outright.** If we accept that ATProto's specific-over-generic convention is correct in the limit, the generic primitive shouldn't exist at all. Mark deprecated and plan a domain-specific response shape for any future need.

**Recommendation: option 1.** The cost of keeping `context.acknowledgement` around with a tight charter is small, and the option value of "we have a fallback if a future use case appears that doesn't justify its own lexicon" is real. Revisit if a year passes and the fallback never gets used.

### Concrete work to ship the response

1. Author `lexicons/org/hypercerts/funding/response.json` upstream, merge to `hypercerts-org/hypercerts-lexicon`.
2. Update the lexicon repo's README with the `context.acknowledgement` fallback charter (option 1 above).
3. Allowlist `org.hypercerts.funding.response` in `ALLOWED_WRITE_COLLECTIONS` (`src/app/api/xrpc/[...method]/route.ts`).
4. `src/lib/atproto/funding-response.ts` — `createFundingResponse`, `listResponsesForReceipt`, `deleteFundingResponse`, with rate-limiting registered.
5. Indexer fan-in queries: `appHypercertsFundingResponse(where: {receipt: ...})` for the recipient-side "Disputed by funder" rendering; `(where: {repo: <funder_did>, acknowledged: true})` for the funder-side default-hide filter.
6. UI: response menu on receipt cards (recipient surface); funder-profile receipt feed with the default-hide filter and an inbox of pending receipts naming the viewer.

Sequencing relative to §10 follows below.

## 9. Optional cryptographic envelope — receipt + badge.blue without the rest of attested.network

The §6 recommendation rejected attested.network as a wholesale replacement for the receipt. But the cryptographic primitive at attested.network's *core* — badge.blue's CID-first, ECDSA-signed attestation — is content-agnostic. It signs any ATProto record, regardless of which lexicon defines it. That opens a third path that wasn't explicit in §6: **keep `funding.receipt` as the data shape, layer in badge.blue signatures only when a verifier needs them, skip every other piece of attested.network's protocol.**

### What this actually involves

Two compatible mechanisms for attaching signatures, used differently:

1. **Inline signatures on the receipt itself.** Add an optional `signatures: array` field to `funding.receipt`. At write time: build the body, strip `signatures`, inject `$sig` metadata with the writer's repo DID, DAG-CBOR → SHA-256 → CIDv1, sign with the writer's repo-signing key (resolved from their DID document), embed inline. Receipt remains parseable by everything that doesn't care; verifiers who do care immediately have the signature to check. Small lexicon change upstream — we own the repo, so this is free.
2. **Remote attestations on counter-signers' repos.** A separate `proof`-style record on the *signer's* PDS strong-refs the receipt. No change to the receipt lexicon. Lets third parties (funders, witnesses, auditors) sign someone else's receipt without write access to it.

Use inline for self-signatures (cheap, makes the record portable); use remote for third-party co-signatures.

### Who actually signs, and is each signature worth having?

Three plausible signers with very different marginal value:

| Signer | Mechanism | Marginal value over a bare receipt |
|---|---|---|
| **Recipient self-signs their own receipt** | Inline | Low. The record is already implicitly signed via the recipient's repo MST. An additional inline ECDSA signature is roughly redundant — its only benefit is making the record portable (verifiable off-platform without resolving the PDS) and survivable across PDS migrations. |
| **Funder counter-signs the receipt** | Remote attestation on the funder's PDS | **High.** This is the genuine counter-signature attested.network's three-party model gets you for free. The funder cryptographically attests "yes, I paid X to Y on date Z" — not just "I acknowledge this." A grant audit can verify both signatures against published DID keys without trusting either PDS host. |
| **Independent third-party broker signs** | Remote attestation | Highest in attested.network. We don't have a broker; substitute is the receipt's `transactionId` pointing at an independently-verifiable on-rail artifact (etherscan tx, Stripe webhook signed by Stripe's key, bank reference). Functionally equivalent for most audit purposes, not protocol-internal. |

The middle row is the prize. Funder counter-signature is what most realistic counterparties (grant programmes, compliance teams, transparency dashboards) actually need. We can get it without any of attested.network's protocol surface.

### What we keep vs. drop from attested.network

| From attested.network | Decision | Reason |
|---|---|---|
| `network.attested.payment.{oneTime,recurring,scheduled}` lexicons | **Drop** | We use `funding.receipt` instead. |
| `network.attested.payment.proof` (the lexicon name) | **Drop the name; keep the pattern** | We'd define our own — e.g. `org.hypercerts.funding.attestation` — or sign inline. Same cryptographic shape, different NSID. |
| `initiate / status / lookup` XRPC | **Drop** | No in-app payment flow. Payments stay off-platform. |
| Broker entity | **Drop** | We don't have one and don't want to be one. |
| Trust models (Strict / Creator-trusted / Federated) | **Drop the formalism, keep the spirit** | Two tiers in practice: payer-counter-signed receipts are higher-trust; unsigned receipts are the default. |
| DID-doc `#AttestedNetwork` service endpoint | **Drop** | No servicer discovery needed. |
| badge.blue CID-first attestation primitive | **Keep** | The whole point of this option. |

### Cost comparison

| Cost | Receipt + badge.blue (this option) | Full attested.network |
|---|---|---|
| Lexicon change | Small upstream PR (we own it) | Adopt a whole new namespace |
| Client code | CID-gen + ECDSA sign + verify, lazy-loaded in the browser | Same + payment-flow client + servicer discovery + polling |
| Server / operational | None new | Broker relationships (or be one — KYC, AML, rail integrations, regulatory) |
| Time to ship the primitive | Weeks | Months minimum; indefinite if waiting on a broker |
| Reversibility | High — unsigned receipts still render unchanged; verification is an optional chrome upgrade | Low — once committed to attested.network's lexicons, retreating means migrating records |

### Relationship to `funding.response` (§8)

A funder counter-signature does **not** replace the response lexicon. The two answer different questions:

- `funding.response` carries **meaning**: acknowledged / disputed / corrected. Required for dispute and correction flows — silence-as-dispute fails because the absence of a signature collapses four different states (no opinion / not yet seen / disputing / will sign later) into one indistinguishable null.
- A badge.blue signature carries **proof**: this exact DID cryptographically vouched for these exact bytes. Cannot express disagreement (signing is by definition consent), so it can't replace the dispute primitive.

The clean integration: `signatures: array (optional)` is a field on `funding.response` itself (already added to the §8 schema). One record, two roles — the semantic claim *and* its cryptographic proof when one is needed. Unsigned responses still parse and render; signed responses unlock off-platform verifiability. The verifier downstream gets to decide: trust the bare boolean, or require a signature on it.

A signature directly on the *receipt* (rather than on the response) is strictly stronger trust ("I vouch for the receipt itself, not just for my response to it"), but rarely needed in practice beyond a signed response. Reasonable to defer indefinitely.

### The honest tradeoff (binary value curve, but the curve flips sooner)

Like any "add signatures we don't yet have a verifier for" choice, this is a conditional capability: close to zero value until a real counterparty wants to verify it, sharply positive the moment one does. Carrying cost is bundle weight, key-resolution code, PLC log walking, and a verification path we'd need to operate competently or not ship at all.

But the **probability** of a real counterparty showing up is meaningfully higher for funding receipts than for most social-graph claims:

- Grant programmes routinely audit how their money was used and may require evidence of fund flow.
- Compliance teams at larger funders may not accept self-reported receipts and may require cryptographic counter-signature.
- DAOs and foundations publishing transparency reports need a verifiable funding ledger.
- Tax authorities in some jurisdictions care about funding-flow attestation.
- Third-party reputation systems (impact scoring, retrofunding, public-goods dashboards) consume funding flows and benefit from a host-independent trust path.

The watch-list trigger from §6 ("a real funder tells us their compliance team won't accept self-reported receipts") looks more like a *when* than an *if* for receipts.

### Two reasonable stances for the team

1. **Defer.** Ship the bare receipt (§10 plan) first; add badge.blue signatures as a v2 the moment a counterparty appears. Conservative; matches the binary-value-curve logic; keeps v1 small. Current default.
2. **Ship the primitive alongside the receipt.** Take the carrying-cost hit upfront on the (plausible) bet that a verifier appears within a year. The primitive sits dormant until used, but it's *there* the first time a funder asks for cryptographic proof — no migration scramble.

Stance 2 is more defensible for receipts than for most social claims, because the imminent-counterparty probability is higher. The right call probably depends on whether anyone on the team has a concrete funder/grant programme in mind whose compliance posture we'd need to accommodate within 6–12 months. Without one, stance 1 is correct.

## 10. What we should do this quarter

- **Ship `org.hypercerts.funding.receipt` end-to-end.** Allowlist `org.hypercerts.funding.receipt` in `ALLOWED_WRITE_COLLECTIONS`; add a `createReceipt` helper in `src/lib/atproto/`; render receipts on profile/project pages keyed off the `for: strongRef`; add an indexer fan-in query for "receipts received by X."
- **Defer attested.network.** No prototype, no shim. Track the spec via Nick Gerakines's repo notes the same way we track badge.blue.
- **Build the three pragmatic strengthening hooks in §7.** Cheap, materially better than naked receipts. The funder-response hook depends on shipping `org.hypercerts.funding.response` first (§8) — sequence it after the receipt itself ships, so v1 of receipts is unblocked.
- **If a funder asks for cryptographic proof,** the implementation shape is in §9 — receipt + badge.blue signatures, no broker required. The receipt stays the source of truth (what we render, index, and power the UI with); the signature is the verification mechanism for audiences that need one. Open a follow-up doc to scope the work concretely when the trigger fires.

## 11. Open questions for the meeting

1. Is the funding-receipts use case primarily **profile/project credit-giving** (my read), or do we have a pipeline use case where a funder will programmatically read receipts and *act* on them? The answer shifts the calculus on §6(5).
2. Are we comfortable with the "anyone can claim anything" failure mode if §7's mitigations are in place?
3. Is there appetite to be a *broker* on attested.network at some future point — i.e. process payments on-protocol with Certified attestations — or is that explicitly out of scope for the product?
4. Do we want `from: DID` recipients to receive a notification ("X named you as a funder of project Y") so the implicit counter-receipt loop closes naturally?
5. Are we comfortable shipping `org.hypercerts.funding.response` as a new lexicon (§8), and is option 1 — demote `context.acknowledgement` to a fallback primitive with a tight charter — the right call for the existing record?
6. Is the split default visibility model (recipient-side default-show, funder-side default-hide) the right ratio between "claims surface freely" and "people don't get spammed onto their own profile"? Any product objections to that asymmetry?
7. On §9, do we have any concrete funder, grant programme, or transparency consumer in mind that would need cryptographic counter-signature within the next 6–12 months? If yes, stance 2 (ship the primitive alongside the receipt) becomes the live option; if no, stance 1 (defer until the trigger fires) is the default.

---

**Sources**
- `hypercerts-org/hypercerts-lexicon/lexicons/org/hypercerts/funding/receipt.json`
- `attested.network` (draft community spec by Nick Gerakines, built atop badge.blue's CID-first attestation framework)
- `badge.blue` (spec page; the CID-first attestation primitive attested.network is built on)
