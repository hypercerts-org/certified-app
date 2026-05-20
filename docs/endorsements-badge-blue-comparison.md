# Endorsements: `app.certified.badge.*` vs. badge.blue

**Status:** Discussion draft for team review
**Author:** prepared for the team, 2026-05-19
**TL;DR:** They are not the same kind of thing. **Don't switch.** badge.blue is a record-level signature *primitive*; ours is a social *product*. If anything, badge.blue is a candidate building-block we could layer in later for a narrow set of future use cases (third-party co-signatures, verifiable off-platform claims) — not a replacement for what we already ship.

---

## 1. What we ship today (`app.certified.badge.*`)

Three records, lifted from the canonical `hypercerts-org/hypercerts-lexicon`:

| Record | Where it lives | Purpose |
|---|---|---|
| `app.certified.badge.definition` | Issuer's PDS | Declares a badge type (`badgeType: "endorsement"`, title, description, optional `allowedIssuers`). Lazily created on first endorse. |
| `app.certified.badge.award` | Issuer's PDS | An issuer awards a badge to a subject (DID or strongRef). Carries an optional `note` (≤ 500 bytes) and a strongRef back to the definition. |
| `app.certified.badge.response` | Recipient's PDS | Recipient accepts/rejects/hides an award. Default-show: an award is visible until the recipient explicitly rejects it. |

Design properties:

- **Trust model: repository signatures.** Every record sits in the issuer's PDS and is signed by the issuer's repo key as part of the ATProto repo MST. The trust statement "X endorsed Y" is provable from "this `badge.award` record exists in X's signed repo and references Y." No additional cryptography is required.
- **Mutual consent.** Recipient holds the `response` record on their own PDS, so they control what shows on their profile — the issuer can't force-publish to a wall they don't own.
- **Lists.** A `badge.definition` with `badgeType: "endorsement"` and a non-default `title` becomes a categorisation list ("Mentors", "Reviewers", …). Same lexicon, no extension.
- **Aggregation via `magic-indexer`.** Fan-in queries (`appCertifiedBadgeAward { where: { subject: { eq: did } } }`) collapse N PDS round-trips into one — needed for "endorsements received."
- **Rate-limited writes.** `badge.award` writes go through our XRPC proxy, allowlisted in `ALLOWED_WRITE_COLLECTIONS`, with per-collection rate limits.
- **Optimistic UI everywhere.** Endorse / revoke / accept / reject all use the standard optimistic-then-reconcile pattern from §15a of `AGENTS.md`.

Files of record: `src/lib/atproto/badges.ts`, `src/hooks/use-{received,given}-endorsements.ts`, `src/components/profile/profile-endorsements.tsx`, `src/components/badges/response-menu.tsx`, lexicons in `hypercerts-org/hypercerts-lexicon`.

## 2. What badge.blue actually is

badge.blue is **a specification for cryptographic attestations on AT Protocol records** (open-source reference impl: `atproto-attestation` Rust crate, MIT). It is not a product, not a Bluesky badge service, and it does not define any social-graph lexicons.

What the spec gives you:

- **Two attestation forms.** *Inline* — ECDSA signature embedded in the target record's `signatures` array. *Remote* — a separate proof record in the attestor's repo, referenced by `com.atproto.repo.strongRef`.
- **Deterministic CID generation.** Strip `signatures` → inject `$sig` metadata containing the repo DID → serialize DAG-CBOR → SHA-256 → CIDv1. This is the payload that gets signed.
- **Repository binding (the headline property).** The repo DID is baked into the metadata before CID-generation, so copying a signed record into a different repo invalidates the signature. Prevents replay across repos.
- **ECDSA curves: P-256, P-384, K-256.** Low-S normalization. Verification is "recompute the CID, verify the ECDSA sig against a resolved public key."

What badge.blue is **not**:

- Not an endorsement product. There is no UI, no "who endorsed whom" record, no inbox.
- Not a Bluesky lexicon set. The example NSIDs in the spec are `com.example.*`. The spec is content-agnostic — it tells you how to *sign* an arbitrary ATProto record, not what to put in it.
- Not a hosted service. There's an in-browser interactive demo on the spec page and a Rust crate. There's nothing else to "switch to."

## 3. The trust delta: host + key → key alone

This is the property that does the work in every badge.blue use case, so it's worth stating bluntly.

**Today (our repo-signature model).** A verifier convinces themselves that "X endorsed Y" by:
1. Fetching the `badge.award` record from X's PDS.
2. Trusting that the PDS host served the real signed record from X's repo.
3. Optionally walking the ATProto repo MST signature chain back to X's signing key.

The PDS host is in the trust path on step 1, and in practice verifiers almost never re-verify the MST chain — they trust the host. A compromised or hostile PDS host could, in principle, serve fabricated records under X's DID until X's next legitimate write rotates the MST root.

**With badge.blue.** The verifier:
1. Gets the record bytes from **anywhere** — PDS, cache, S3 bucket, email attachment, a screenshot of JSON. Provenance of the bytes is no longer load-bearing.
2. Recomputes the CID (DAG-CBOR + SHA-256, with X's repo DID baked into `$sig`).
3. Verifies the ECDSA signature against X's pinned public key.

The PDS host falls out of the trust boundary at step 1. The host can disappear, lie, get compromised, or be replaced — the signature still verifies (or doesn't) against the key the verifier already trusts.

**One-line summary:** badge.blue **narrows the trust boundary from "host + key" to "key alone."**

**Two honest caveats:**

- **You still trust *something*.** badge.blue moves the anchor from "the PDS host serving X's repo" to "the public key the verifier has pinned for X." Key distribution, rotation, and revocation become the new problem. ATProto's DID document publishes keys, so this is mostly "use the DID doc" — but if the DID doc itself is served by a hostile resolver, you're back to host-style trust unless the verifier pins out-of-band.
- **It removes forgery from the host's power, not omission.** A hostile host can still *hide* a record (refuse to serve it). It just can't *forge* one. For endorsements this is usually fine — fabrication is the threat we care about; the recipient has incentive to surface omissions themselves.

**Why this matters for the recommendation:** every concrete badge.blue use case (third-party co-signatures, off-platform recruiters, archives, multi-tenant aggregators, multi-signer attestations) is really one question with different costumes — *is there a verifier who doesn't trust our host?* For in-app endorsement display the host is us, so the property is moot. For an external recruiter parsing a JSON export, it's the whole game. Until we have that external verifier on the roadmap, the narrowed trust boundary is paying for capability we don't consume.

## 4. Side-by-side

| Dimension | `app.certified.badge.*` (ours) | badge.blue |
|---|---|---|
| **Scope** | Domain-specific: endorsements, lists, accept/reject UX. | Generic primitive: sign any ATProto record. |
| **Layer** | Application + data model. | Cryptographic envelope under the data model. |
| **Trust source** | Issuer's repo signature on the PDS record. | Per-record ECDSA signature, independent of the repo signature. |
| **Multi-signer support** | No (one issuer per award; lists are by-definition, not co-sign). | Yes — inline `signatures` array accepts many attestors. |
| **Detached / third-party claims** | No. Trust = "the record is in the issuer's signed repo." | Yes — anyone with a published key can attest a record without write access to it. |
| **Replay protection across repos** | Implicit: the record lives in exactly one repo. | Explicit: repo DID is hashed into the signed CID. |
| **Mutual-consent UX (accept/reject/hide)** | Yes (`badge.response`). | Out of scope. |
| **Lists / categorisation** | Yes. | Out of scope. |
| **Indexer fan-in** | Yes, via `magic-indexer`. | N/A — would need to layer on top. |
| **Rate limiting** | Yes, server-side allowlist. | N/A. |
| **Maturity in our codebase** | Shipped, ~14 production awards already, full UI surface. | Spec + Rust crate; we'd be the first integration in our stack. |
| **Effort to adopt** | 0 (status quo). | Non-trivial: pick curves, manage keys per issuer, add CID-gen path, write verify path everywhere we display awards. |
| **Failure mode of incumbent that switching would fix** | None we've observed. | — |

## 5. The "should we switch" question is malformed

Reframing: the two systems sit at different layers, so the real choices are:

1. **Replace.** Throw away `badge.{definition, award, response}` and re-express endorsements as badge.blue attestations. **Doesn't work** — badge.blue has no opinion about what an endorsement *is*. We'd have to invent our own attestation `type` strings (e.g. `app.certified.endorsement`), reinvent the accept/reject flow, lose the indexer affordances, and rewrite every read path. We'd end up with a worse-typed version of what we have now, plus an ECDSA dependency.
2. **Layer in.** Keep `badge.*`, optionally add a badge.blue signature to each `badge.award` for cases where the extra cryptographic envelope is load-bearing. Plausible — but **what problem are we actually solving?** The repo signature already ties an award to its issuer. The only scenarios where badge.blue's signature is strictly stronger:
   - A third party co-signing someone else's award (e.g. an org co-attesting a member's endorsement). We don't have this requirement.
   - Off-platform verifiability where a consumer doesn't trust the issuer's PDS host but does trust a published ECDSA key. We don't have this consumer.
   - Moving / republishing an attestation across repos with cryptographic continuity. We don't republish.
3. **Ignore.** Status quo.

## 6. Exploration: the best possible badge.blue integration (cost-free)

The recommendation in §8 leans on cost. To make the decision honest, this section drops the cost constraint entirely. **Assume implementation is free.** What does the ideal layer-in look like, and what does it actually unlock? If the cost-free end-state turns out to be uninteresting, the recommendation is over-determined; if it's exciting, the recommendation is a deliberate timing call rather than a rejection of the idea.

### 6.1 Data-model deltas

- `app.certified.badge.award` gains an optional `signatures: array` per badge.blue's inline form. Backward compatible — unsigned awards remain valid.
- A new lexicon `app.certified.badge.attestation` for remote attestations (badge.blue's "proof" pattern), written by *third parties* who co-sign someone else's award. Lives on the co-signer's PDS, strongRefs the award.
- `badge.definition` and `badge.response` are unchanged.

### 6.2 Signing-key model

Two tiers, picked transparently by the client:

- **Default — reuse the user's ATProto repo-signing key.** Resolved via the verification method in their DID document. Zero new key-management overhead. The same key that already signs every record in their repo's MST signs the inline attestation.
- **Optional — dedicated `#badge-signing` verification method.** Advanced users publish a separate key in their DID doc for badge-level attestations only. Isolates compromise: rotating the badge key doesn't invalidate the rest of the repo and vice versa. Off by default.

### 6.3 Write paths

`createEndorsementAward(ownDid, subjectDid, note?)` gains five intermediate steps between "build record body" and "createRecord":

1. Build the award body (as today).
2. Strip any `signatures` field, inject `$sig` metadata containing the issuer's repo DID.
3. Serialize to DAG-CBOR; SHA-256 hash; wrap as CIDv1 (codec `0x71`). This is the signing payload.
4. Sign the CID with the issuer's repo (or dedicated) key.
5. Embed the signature inline in `signatures`; call `createRecord` with the signed body.

Co-sign flow (new):

- "Co-attest this endorsement" affordance on award cards, conditionally rendered for qualified parties (org admins for org-related endorsements; trusted communities; future: any signed-in viewer in a permissive mode).
- Writes an `app.certified.badge.attestation` record on the co-signer's own PDS strongRef-ing the award. Same CID-gen + sign pipeline, different lexicon.

### 6.4 Read paths

Every existing read path stays unchanged at the data layer; verification is layered on as an optional chrome upgrade:

- After fetching an award, the client lazily fetches the issuer's DID document, extracts the verification method, recomputes the award's CID, and verifies the inline ECDSA signature.
- Verified awards render with a subtle "✓ verified" indicator. Unverified or unsigned awards render exactly as they do today — no warning, no penalty, no degradation. This keeps backward compatibility absolute.
- Co-signed awards display a "Co-attested by N" chip; clicking opens a list with each co-signer verified independently.

### 6.5 New UI affordances

- **"Export verifiable receipt"** in the award kebab menu. Copies a JSON blob (the award + signatures + an inline pointer to the verification spec) suitable for paste-anywhere portability — email, CV, hiring portal, archive.
- **`certified.app/verify`** — a public, no-login tool. Paste a DID; see the user's endorsements with signature verification rendered explicitly per record. Replaces "do you trust Certified's PDS?" with "do you trust this DID's published key?" for any third party.
- **Profile-card "co-attested" chip.** Surfaces multi-party signals directly without needing to expand the award.
- **Issuer-side toggle.** "Use a dedicated badge-signing key" in profile settings, off by default. Publishes the new verification method to the user's DID doc.

### 6.6 What this unlocks

In rough order of plausibility for our roadmap:

1. **External verification without trusting our host.** A recruiter portal, web3 reputation aggregator, federated identity system, or skills marketplace can verify a Certified endorsement against the issuer's DID-doc-published key — no Certified API in the trust path. This is the off-platform-verifier scenario from §3 made concrete.
2. **Organisation-attested credentials.** A DAO, employer, or community co-signs an individual endorsement. The award now carries two trust signals: "Alice endorses Bob" + "Acme attests that Alice's endorsement is legitimate / within scope / from a real member." Useful for professional credentials, communities of practice, and any context where the org's name carries more weight than the individual's.
3. **Cross-PDS portability and archive survival.** A signed endorsement remains verifiable after the issuer migrates PDS hosts, abandons their account, or after Certified itself goes away. Credentials acquire the property of *outliving the system that minted them* — relevant for any long-shelf-life credential (degrees, certifications, references).
4. **Trust-reduced indexers.** An indexer publishing aggregate endorsement bundles can ship them with the original signatures intact; downstream consumers verify per-record without needing to trust the indexer.

### 6.7 Costs that survive even at zero implementation cost

Some costs are intrinsic to the design, not engineering choices we can amortise away:

- **Signature invalidation on any record edit.** Today our awards are de-facto immutable (delete + recreate is the only mutation). Signatures lock this in cryptographically — even a whitespace change voids the signature. Fine for awards; rules out any future "edit note" affordance.
- **Key rotation is a verifier problem now.** ATProto users legitimately rotate signing keys. A signature under a rotated-out key needs either a historical-key resolver to verify, or acceptance that it verifies as "issued under a *previously*-valid key" — a subtly different trust claim from "issued under the current key." badge.blue notes the problem but doesn't fully solve it.
- **Verifier-key bootstrap.** §3 noted that badge.blue narrows trust from "host + key" to "key alone" — but key distribution then becomes the new problem. ATProto's DID document publishes keys, so it's mostly "use the DID doc" — except that a hostile DID resolver puts you back to host-level trust unless the verifier pins out-of-band.
- **Verification bundle weight.** `@ipld/dag-cbor` + a P-256/K-256 ECDSA library, lazy-loaded off the main thread. Not huge, but a real bundle delta on read paths where verification surfaces. Acceptable price for the capability, but worth pricing in.

### 6.8 What this exercise actually reveals

The cost-free end-state is **genuinely interesting** — capabilities 1, 2, and 3 above are real product surfaces a future Certified might want. The exercise doesn't make the layer-in feel pointless; it makes it feel like infrastructure-in-waiting.

But it also crystallises that all four unlocks require an *external* shape Certified doesn't currently have: an off-platform verifier (1), an org/community asserting authority over its members' claims (2), a credential-shelf-life requirement (3), or an indexer-as-product (4). Until at least one of those shapes exists in our roadmap, the integration is solving for a counterparty that hasn't shown up yet.

So the §8 recommendation stands — but for a sharper reason than "it's expensive." It's that **we'd be the only party at the table.** The signature is for verifiers; we don't yet have verifiers. When we do, the implementation sketch in §§6.1–6.5 is the shape to build. §7 turns this observation into the explicit decision rule the team should use.

## 7. Decision frame: conditional capability, binary value curve

The integration in §6 is tempting to file as a "nice-to-have addition" to our existing badges. That framing is comfortable and wrong in both directions.

**It understates the upside.** For any external verifier — a hiring portal, an archive, a DAO co-signer — the signature is not chrome on top of the badge. It is the entire trust mechanism. Without it, the verifier's question is *"do you trust Certified's PDS?"* — and for most external audiences the honest answer is *"no, I don't know who that is."* With it, the question becomes *"do you trust the issuer's published key?"* — answerable from the DID document alone. In a world where verifiers exist, the signature is the thing that makes the badge mean anything to them.

**It understates the downside.** In a world where verifiers *don't* exist (today), the integration is not chrome; it is unused infrastructure with ongoing carrying cost — bundle weight, key-management complexity, a foreclosed edit-affordance on awards, and a verification path we have to operate competently or not at all (a half-working "✓ verified" checkmark that sometimes fails because we didn't walk the PLC log correctly is worse than no checkmark). We pay for it every week regardless of whether anyone uses it.

The integration's value, then, is not a gradient. It is **a conditional capability with a binary value curve** — close to zero until a counterparty exists, sharply positive the moment one does. This collapses the decision to one question:

> **Do we have, or expect within ~6 months, a real counterparty?**

A "real counterparty" is a concrete entity — a hiring portal partnership, a DAO that wants to co-sign endorsements, an archive integration, a federated identity service — not a hypothetical class of users. If yes, the implementation sketch in §6 is the shape to build, and the carrying cost stops being dead weight the moment it ships. If no, the §9 watch-list posture is the correct one — reach for §6 the day the answer flips, not earlier.

The trap this framing guards against: doing it because it's *interesting*. It is interesting. That is not the same as it being needed.

## 8. Objective argument

**Recommendation: option 3 (status quo), with option 2 on a watch-list.** The reasoning, on the merits:

1. **No identified user problem.** We have not seen a single incident where the repo-signature trust model was insufficient. There is no open issue asking "how do I prove this endorsement is real without trusting the issuer's PDS host?" — and that is the only question badge.blue uniquely answers.
2. **Scope mismatch.** badge.blue solves record-level signature, replay protection, and detached attestation. Our product problem is social UX, indexing, and mutual consent. Adopting badge.blue solves zero of our actual product problems and adds cryptographic machinery we'd then have to operate (key issuance per user, key rotation, verify path on every read).
3. **Cost of switching is large; cost of staying is zero.** We have shipped UI (lists, accept/reject, optimistic state, notification deep-links), an indexer schema (`magic-indexer #87/#88/#89`), and an XRPC allowlist. Replacing would require redesigning all three layers around a primitive that doesn't natively express any of them.
4. **The canonical lexicon is already moving.** `app.certified.badge.response` only just landed in v0.12.0 of the canonical lexicon; we're tracking active spec work upstream. Forking onto a parallel primitive now would orphan that investment.
5. **Maturity asymmetry.** badge.blue has one reference implementation (a Rust crate). The hypercerts lexicon family has us, plus alignment with other ATProto endorsement work. Picking the less-adopted primitive for a problem we don't have is the wrong direction on the diffusion curve.
6. **The honest counter-argument.** If we later need verifiable claims that travel **off-platform** — a recruiter, an external skills marketplace, a hiring portal — and we don't want those consumers to trust our PDS hosts, badge.blue's detached signatures become genuinely useful. That is a real future scenario. It's not a 2026 H1 scenario. Park it.

**Watch-list trigger to revisit:** if we add (a) third-party co-endorsement, (b) off-platform consumer of endorsements, or (c) cross-repo republishing of attestations, badge.blue stops being a curiosity and starts being a building block — all three are concrete instances of "a verifier appears who doesn't trust our host" (§3). Until one lands on the roadmap, this is a no-op.

## 9. What we should do this quarter

- **Nothing on badge.blue.** No prototype, no shim.
- **Continue tracking `hypercerts-org/hypercerts-lexicon` upstream.** That's where our actual lexicon evolves.
- **Keep an eye on `atproto-attestation`** (the Rust crate). If a JS/TS port lands and a peer ATProto app adopts it for endorsements, that's a signal worth re-reading this doc.
- **If a "verifiable claim off-platform" requirement appears,** open a follow-up doc on layering badge.blue *underneath* `badge.award`, not replacing it.

## 10. Open questions for the meeting

1. Do we have any product use case in flight that needs **third-party co-signature** on an endorsement? (If yes, the §7 decision rule fires, the timeline on §8(6) shortens, and the implementation sketch in §6 becomes load-bearing.)
2. Are we OK staying coupled to the hypercerts lexicon family for endorsements, or do we want optionality on the data model? (Answer drives whether option 2 is worth a spike.)
3. Is anyone on the team carrying a contrary read of badge.blue's scope I should reconcile here before we ship this as the team's position?

---

**Sources**
- Our impl: `src/lib/atproto/badges.ts`, `AGENTS.md` §15a, `docs/badge-response-flow/plan.md`.
- badge.blue spec page; `atproto-attestation` Rust crate (MIT).
- Canonical lexicon: `github.com/hypercerts-org/hypercerts-lexicon`.
