# Endorsements: `app.certified.badge.*` vs. badge.blue

**Status:** Discussion draft for team review
**Date:** 2026-05-19
**Question for the team:** Should we adopt badge.blue's cryptographic attestation primitive for endorsements — by replacement, by layering, or not at all?

**Author's priors (disclosure):** This doc is written by someone who works on the current `app.certified.badge.*` implementation. I have a built-in incentive to find reasons the current design is adequate. I've tried to argue both sides at equal length; readers should still discount accordingly.

**TL;DR:** The two systems sit at different layers — one is a social product, the other is a record-level signature primitive — so the literal question "switch?" admits three answers (replace, layer, ignore). The case for layering badge.blue in is real and gets stronger the longer we wait; the case for deferring rests on the absence of an external verifier today. My lean is option 2 (layer in), but on a planned horizon rather than this quarter; the strongest counter-argument is option 3 (defer), and the strongest pro-active argument is "do it now to avoid retrofit cost on a growing corpus." Both are defensible.

---

## 1. What we ship today (`app.certified.badge.*`)

Three records, lifted from the canonical `hypercerts-org/hypercerts-lexicon`:

| Record | Where it lives | Purpose |
|---|---|---|
| `app.certified.badge.definition` | Issuer's PDS | Declares a badge type (`badgeType: "endorsement"`, title, description, optional `allowedIssuers`). Lazily created on first endorse. |
| `app.certified.badge.award` | Issuer's PDS | An issuer awards a badge to a subject (DID or strongRef). Carries an optional `note` (≤ 500 bytes) and a strongRef back to the definition. |
| `app.certified.badge.response` | Recipient's PDS | Recipient accepts/rejects/hides an award. Default-show: an award is visible until the recipient explicitly rejects it. |

Design properties:

- **Trust model: repository signatures.** Every record sits in the issuer's PDS and is signed by the issuer's repo key as part of the ATProto repo MST.
- **Mutual consent.** Recipient holds the `response` record on their own PDS.
- **Lists.** A `badge.definition` with a non-default `title` becomes a categorisation list ("Mentors", "Reviewers", …).
- **Aggregation via `magic-indexer`.** Fan-in queries collapse N PDS round-trips into one.
- **Rate-limited writes** through our XRPC proxy.
- **Optimistic UI** following the standard pattern from §15a of `AGENTS.md`.

Status: shipped; small production corpus (~14 awards at time of writing); full UI surface; coupled to the hypercerts lexicon family upstream.

Files of record: `src/lib/atproto/badges.ts`, `src/hooks/use-{received,given}-endorsements.ts`, `src/components/profile/profile-endorsements.tsx`, `src/components/badges/response-menu.tsx`.

## 2. What badge.blue is

badge.blue is **a specification for cryptographic attestations on AT Protocol records.** Open-source reference implementation: `atproto-attestation` Rust crate (MIT). It is not a product, not a Bluesky badge service, and does not define social-graph lexicons.

What the spec provides:

- **Two attestation forms.** *Inline* — ECDSA signature embedded in the target record's `signatures` array. *Remote* — a separate proof record in the attestor's repo, referenced by `com.atproto.repo.strongRef`.
- **Deterministic CID generation.** Strip `signatures` → inject `$sig` metadata containing the repo DID → DAG-CBOR → SHA-256 → CIDv1. This is the signed payload.
- **Repository binding.** The repo DID is hashed into the metadata before CID generation, so copying a signed record into a different repo invalidates the signature.
- **ECDSA curves: P-256, P-384, K-256.** Low-S normalization.

What badge.blue is not:

- Not an endorsement product. No UI, no inbox, no social graph lexicons.
- Not a hosted service. There's an in-browser demo and a Rust crate.
- Not a replacement for any specific endorsement schema — it's content-agnostic.

Maturity: spec + one reference impl. No known JS/TS port yet.

## 3. The trust property: what changes

The technical delta:

**Today.** A verifier convinces themselves "X endorsed Y" by:
1. Fetching `badge.award` from X's PDS.
2. Trusting that the host served the real signed record from X's repo (or, rarely, walking the ATProto repo MST back to X's signing key).

**With badge.blue.** The verifier:
1. Gets the record bytes from anywhere — PDS, cache, export, screenshot of JSON.
2. Recomputes the CID (DAG-CBOR + SHA-256, with X's repo DID in `$sig`).
3. Verifies the ECDSA signature against X's pinned public key (typically resolved from their DID document).

The shift: **the host moves from "in the trust path" to "convenient but not required."**

What this does *not* solve:

- **Omission.** A hostile host can still hide records; it just can't forge them.
- **Bootstrap of the verifier's key trust.** ATProto DID docs publish keys, but a hostile DID resolver puts you back to host-style trust unless the verifier pins out-of-band.
- **Key rotation.** A signature under a rotated-out key needs either a historical-key resolver or acceptance of a subtly different trust claim ("issued under a previously-valid key").

Who benefits from the shift:

- **Anyone who doesn't already trust our host.** External verifiers, archives, third-party indexers.
- **Users themselves**, in scenarios where their credentials need to outlive any platform (Certified shuts down, user changes PDS, etc.).
- **Us, internally,** in any context where we want receipts a hostile actor couldn't fabricate even with our cooperation — e.g. if we delegate signing, are subpoenaed, or want to prove an endorsement we displayed wasn't synthesised by a bug.

## 4. Three integration options

1. **Replace.** Move trust to badge.blue, re-express endorsement semantics. Two sub-variants: (a) replace everything including the social UX with a flat attestation model; (b) keep `badge.definition` / `badge.response` as application state and replace only `badge.award` with a signed primitive. (b) is the more credible reading of "replace."
2. **Layer.** Keep `badge.{definition, award, response}`. Add an optional `signatures` array to `badge.award` populated by badge.blue's inline form. Optionally add `app.certified.badge.attestation` for third-party co-signatures. Verification is additive; unsigned awards still render.
3. **Ignore (status quo).** Continue as-is; revisit on triggers.

## 5. Side-by-side

| Dimension | `app.certified.badge.*` | badge.blue |
|---|---|---|
| **Scope** | Domain-specific: endorsements, lists, accept/reject UX | Generic record-signing primitive |
| **Layer** | Application + data model | Cryptographic envelope under the data model |
| **Trust source** | Issuer's repo signature on the PDS record | Per-record ECDSA signature, independent of the repo signature |
| **Multi-signer support** | One issuer per award | Inline `signatures` array accepts many attestors |
| **Detached / third-party claims** | No | Yes |
| **Replay protection across repos** | Implicit (record exists in one repo) | Explicit (repo DID hashed into signed CID) |
| **Mutual-consent UX** | Yes (`badge.response`) | Out of scope |
| **Lists / categorisation** | Yes | Out of scope |
| **Indexer fan-in** | Yes (`magic-indexer`) | Would need to layer on top |
| **Maturity in our codebase** | Shipped; small corpus | Spec + Rust crate; no JS/TS port we'd use |
| **Marginal effort to adopt** | 0 (status quo) | Non-trivial: CID generation, key resolution, verification path, optional UI for verification status |
| **Effort to retrofit later** | N/A | Grows with corpus size; creates a permanent signed/unsigned split |

## 6. Case for adopting (now or soon)

### 6.1 Capabilities currently absent from the product

- **External verifiability.** Any recipient of an exported endorsement (hiring portal, archive, federated identity service, skills marketplace, regulator) can verify it against the issuer's published key without calling our API. Today, "do you trust Certified's PDS?" is part of the question; with signatures it isn't.
- **User-owned, platform-independent credentials.** Users can prove their endorsements remain valid even if Certified shuts down, their PDS host disappears, or they migrate accounts. This aligns with the AT Protocol's underlying pitch; without it, the credential is functionally tied to our continued operation.
- **Tamper-evident receipts in operational contexts.** If we ever delegate signing, face a regulatory inquiry, or hit a bug that produces phantom awards, signatures give us (and our users) receipts we could not have synthesised. This benefit exists even when we are the host.
- **Multi-party trust signals.** An organisation, community, or DAO co-signing an individual's endorsement creates a stacked trust claim ("Alice endorses Bob" + "Acme attests Alice's endorsement is from a member in good standing"). No analog in the current model.

### 6.2 Option cost of delay

- **Two-tier verification.** Once N awards exist unsigned, retrofitting creates permanent ambiguity: a viewer sees some signed and some unsigned awards, with no principled trust ordering. The longer we wait, the larger the unsigned tail.
- **Backfill is structurally impossible.** We cannot retroactively sign records on behalf of issuers; only the issuer's key can. Awards minted before integration can never gain signatures.
- **Trust-property opportunities don't show up uniformly.** A regulatory or partnership ask typically arrives with a short fuse. Having the primitive in place before the ask is much cheaper than racing it.

### 6.3 Strategic posture

- **Early-mover positioning.** Being one of the first AT Protocol apps with verifiable social attestations could itself attract counterparties (the chicken-and-egg cuts both ways: counterparties may be waiting for someone to ship the primitive).
- **Spec hygiene.** If we contribute the inline signature shape to the hypercerts lexicon family upstream, we shape the spec rather than tracking it.

### 6.4 Honest caveats on this case

- The first three §6.1 capabilities are *currently unconsumed*. They are real product surface, but no team or user is asking for them today.
- "Future Certified failure modes" (compromised employee, buggy proxy) are real but low probability and partially mitigated by other controls.
- Retrofit ambiguity matters more if we expect to ship many awards before integration; less if growth stays at the current rate.

## 7. Case for staying (today)

### 7.1 No active demand

- No user has reported a missing verification capability. No partnership ask has surfaced a need for external verifiability. (Caveat: absence of complaint is weak evidence — users don't request features they assume don't exist.)
- Repo-signature trust has not failed in observable ways. There is no incident postmortem driving this decision.

### 7.2 Adoption cost is non-trivial and recurring

- **Engineering cost:** CID generation pipeline, key resolution from DID documents, verification path on every read where we want to surface signature status, optional UI for verification state and co-attestation.
- **Carrying cost:** Bundle weight (`@ipld/dag-cbor` + an ECDSA library, lazy-loadable but real), a verification path we must operate competently (a half-working "✓ verified" indicator is worse than none), key-rotation handling, historical-key resolution for old signatures.
- **Foreclosed affordances:** Signatures invalidate on any edit. Today's awards are de-facto immutable, so this is small — but it rules out a future "edit note" feature.

### 7.3 Misaligned maturity

- One reference impl (Rust). No JS/TS port we'd use; we'd either port it or write our own. Either path puts us on the leading edge of a spec that may still evolve.
- The hypercerts lexicon family is the active locus of our data-model evolution. Layering in a parallel signing spec is coherent but adds a dimension to track.

### 7.4 The scope-mismatch observation

- badge.blue is a record-signature primitive; our open product questions are mostly social-UX questions (lists, accept/reject, notifications, discovery). Adopting badge.blue solves zero of the social-UX questions and adds a cryptographic surface we then operate.

### 7.5 Honest caveats on this case

- "No identified user problem" is a weak test for trust properties, which exist to prevent failures whose first occurrence is the failure to prevent.
- "Cost of staying is zero" undercounts: it ignores the option cost of retrofit (§6.2) and any value users would derive from portability if it existed.
- The carrying-cost concerns are real but bounded; the bundle delta is small and the verification path is well-understood.

## 8. Decision factors

The choice hinges on judgments about four things:

1. **Time horizon for an external verifier appearing.** Months → option 2 (layer) starts paying off immediately. Years → option 3 (ignore) is cheaper. Never → option 3 dominates.
2. **Expected award-corpus growth.** Slow growth → retrofit cost stays low; option 3 stays safe. Fast growth → retrofit cost compounds; option 2 gets sharper.
3. **Weight on user-sovereignty as a value proposition.** If "your credentials outlive Certified" is part of the pitch, option 2 ships the property. If the pitch is about in-app experience, option 3 is fine.
4. **Tolerance for carrying cost on unconsumed infrastructure.** Higher tolerance → option 2 is acceptable as infrastructure-in-waiting. Lower tolerance → wait for a concrete trigger.

Reasonable people can place each of these knobs differently and reach different conclusions. There is no objectively correct answer that survives all knob settings.

## 9. Author's lean (opinion, not analysis)

I lean toward **option 2 on a planned horizon — schedule it for the next quarter we have capacity, not this one**, for these reasons:

- The retrofit-cost asymmetry (§6.2) is the strongest single argument, and it strengthens monotonically with corpus size.
- The user-sovereignty argument feels load-bearing for an ATProto-native product even without an explicit roadmap item.
- The carrying cost is real but small; the verification path is straightforward.

I could be talked out of this by:

- Evidence that award growth will stay slow indefinitely (retrofit cost stays bounded).
- A strong signal that hypercerts-org is converging on a different signature story we'd want to inherit.
- Team capacity reality where any non-roadmap quarter-spend has clear opportunity cost.

The opposite lean (option 3, status quo) is defensible on the symmetric reading: with no consumer in sight and a small corpus, the option-cost concern is theoretical. I think it understates the retrofit asymmetry, but it isn't wrong.

Option 1 (replace) I don't think survives scrutiny in either sub-variant: (a) sacrifices social UX without a comparable benefit; (b) is essentially option 2 with extra steps and worse compatibility.

## 10. Triggers to revisit (in either direction)

**Triggers toward adoption:**

- Any external-verifier ask: partnership, regulatory, integration, archive.
- A user explicitly requesting portability of their endorsement record.
- Award growth crossing a threshold where retrofit ambiguity becomes a real consideration (rough order: hundreds, not tens).
- A peer ATProto app adopting badge.blue or an equivalent — interop pressure.
- A JS/TS port of `atproto-attestation` landing, dropping adoption cost.
- Internal need: delegated signing, audit trail for an investigation, evidence-of-non-fabrication request.

**Triggers toward formal deferral:**

- Hypercerts lexicon publishing a competing signature story we'd inherit by tracking upstream.
- A team-level decision to keep endorsement scope minimal and prioritise other product surfaces.
- Evidence that user growth is flat enough that retrofit risk stays bounded.

## 11. Open questions for the meeting

1. Is "credentials that survive Certified" part of our pitch, implicitly or explicitly? (Drives factor 3.)
2. What's the realistic 12-month award-corpus growth estimate? (Drives factor 2.)
3. Are any in-flight partnerships, integrations, or regulatory conversations within scope of badge.blue's capability set?
4. Does the team have capacity in a near quarter for a planned, non-emergency integration of this kind?
5. Is anyone carrying a contrary read of badge.blue's scope or our trust model that I should reconcile before this becomes a team decision?

---

**Sources**
- Our impl: `src/lib/atproto/badges.ts`, `AGENTS.md` §15a, `docs/badge-response-flow/plan.md`.
- badge.blue spec page; `atproto-attestation` Rust crate (MIT).
- Canonical lexicon: `github.com/hypercerts-org/hypercerts-lexicon`.
