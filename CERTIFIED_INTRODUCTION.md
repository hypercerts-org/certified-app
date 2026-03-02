# Certified — Product Context

> Read this before writing any code. This document explains what Certified is, who it's for, and how it fits into the broader ecosystem.
> For visual design guidance, see [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

---

## What is Certified?

Certified is the identity provider for the Hypercerts ecosystem. It is the consumer-facing brand — the part end users actually see and interact with.

Users create one account at [certified.app](https://certified.app) and can sign in to every application built on the Hypercerts Protocol. Their hypercerts, evaluations, contributions, and reputation travel with them across all of these applications automatically.

Think of it as **"Sign in with Google" for impact certificates** — but the user owns their data and can take it elsewhere at any time.

---

## The Problem Certified Solves

The Hypercerts Protocol is built on AT Protocol (the decentralized data layer behind Bluesky). But most Hypercerts users are not Bluesky users — they are researchers, land stewards, open-source maintainers, funders, and evaluators. Asking them to "sign in with Bluesky" to use a funding platform would be confusing.

Certified is a **neutral identity provider** that isn't tied to any single application. Users don't need to know about Bluesky, ATProto, decentralized protocols, or blockchain to use it.

---

## What a Certified Account Gives Users

| Feature | Description |
|---|---|
| **Low-friction sign-in** | Email + code. No usernames, handles, or passwords to manage. |
| **Ecosystem-wide access** | One identity recognized by every Hypercerts application. |
| **Web3 wallet** | Users can link an existing EVM wallet or get an embedded wallet. |
| **DID (Decentralized Identifier)** | A permanent, portable identity that persists even if the user changes servers or handles. |
| **Personal Data Server (PDS)** | User-owned storage for hypercerts, evaluations, and records. |
| **Data portability** | Users can migrate their data to another PDS at any time. No lock-in. |

**Important:** Users with an existing Bluesky or AT Protocol account do NOT need a Certified account. Any ATProto identity works with all Hypercerts applications. However, they still benefit from Certified's services — for example, linking a Web3 wallet to their ATProto identity so they can receive funding through the ecosystem.

---

## Core Services

These are the backend services Certified provides. Users don't see these names — see the jargon rules in DESIGN_SYSTEM.md Section 15.

| Service | Internal Name | What It Does |
|---|---|---|
| **Portable Profiles** | — | User identities that are interoperable across all Hypercerts apps and AT Protocol apps. |
| **Data Hosting** | PDS / SDS | Personal Data Servers for individuals, Shared Data Servers for organizations and collectives. |
| **Identity Link** | IdentityLink | Connects ATProto identities to EVM wallets so funding flows can reach contributors. |
| **Network Index** | AppView / Hypergoat | Indexes hypercert records across the network and exposes them via API for applications to query. |
| **Immutable Backup** | StorageLink | Permanent, immutable backups of data. |
| **Data Ingestion** | Data Plugins | Import data from Google Sheets, Airtable, CSV, GitHub into hypercert records. |

---

## The Ecosystem

Certified does not exist in isolation. It is the identity and data layer that connects a network of partner platforms.

### Partner Platforms (examples)

- **Ma Earth** — Collective Funding for Regenerating Earth
- **GainForest** — Conservation and reforestation
- **Silvi** — Reforestation and tree-planting impact tracking
- **Hyperboards** — Visual display of hypercert contributions

On all of these platforms, users "Sign in with Certified." Their profile, contributions, and impact records appear consistently across every platform — without the user doing anything extra.

### How It Fits Together

```
┌─────────────────────────────────────────────────┐
│                 CERTIFIED                        │
│  Identity · Data Hosting · Wallet Link           │
│  ─────────────────────────────────────────────── │
│  certified.app                                   │
└────────┬──────────────┬──────────────┬──────────┘
         │              │              │
    ┌────▼────┐   ┌─────▼─────┐  ┌────▼────────┐  ┌────▼────┐
    │ Ma Earth│   │ GainForest│  │ Hyperboards  │  │  Silvi  │
    │         │   │           │  │              │  │         │
    └─────────┘   └───────────┘  └──────────────┘  └─────────┘
         │              │              │                 │
         └──────────────┼──────────────┼─────────────────┘
                        │
              ┌─────────▼─────────┐
              │ Hypercerts Protocol│
              │  (AT Protocol)     │
              └───────────────────┘
```

Users sign in at the top. Their data lives in Certified's PDS. Partner apps read and write hypercert records through the protocol. Hypergoat (the AppView) indexes everything so apps can query it via API.

---

## Technical Stack

| Layer | Technology |
|---|---|
| **Identity protocol** | AT Protocol (same as Bluesky) |
| **Identity format** | DIDs (Decentralized Identifiers) |
| **Data storage** | Personal Data Servers (PDS), Shared Data Servers (SDS) |
| **Data schemas** | AT Protocol Lexicons — Certified contributes `app.certified.*` schemas (e.g., `app.certified.location`) |
| **Blockchain integration** | EVM wallets linked via IdentityLink for funding/tokenization |
| **Network indexing** | Hypergoat (AppView) — indexes records, exposes API |
| **Immutable storage** | StorageLink |

---

## Key User Journeys

### 1. New User (on a partner platform)

```
User visits Ma Earth → clicks "Sign in with Certified" → enters email →
receives code → enters code → account created → redirected back to Ma Earth
with a working profile, PDS, and optional embedded wallet.
```

The user never sees the words "ATProto," "PDS," or "DID." They just signed in.

### 2. Returning User (cross-platform)

```
User already has a Certified account from Ma Earth → visits GainForest →
clicks "Sign in with Certified" → already authenticated → their profile,
contributions, and evaluations from Ma Earth are already visible on GainForest.
```

No data migration. No re-entry. It just works.

### 3. Linking a Wallet

```
User goes to certified.app → settings → "Connect wallet" → connects
MetaMask or other EVM wallet → wallet is now linked to their ATProto identity →
funding from any Hypercerts platform can reach them.
```

### 4. Existing ATProto / Bluesky User

```
User already has alice.bsky.social → visits any Hypercerts app → signs in
with their existing ATProto handle → everything works without a Certified
account → can optionally use Certified to link a Web3 wallet, get immutable
backups, or access other services.
```

---

## What This Codebase Is

This is the **certified.app** website — the public-facing site for the Certified brand. It serves as:

1. **Marketing / Landing page** — Explains what Certified is and why users should care.
2. **Sign-up / Sign-in entry point** — Users can create accounts and manage their identity.
3. **Profile management** — Users view/edit their profile, link wallets, manage data.
4. **Developer documentation hub** — Links to integration guides for partner platforms.

The visual design system for this site is in [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

---

## Key Principles for Building

1. **Simplicity first.** The entire point of Certified is that users don't need to understand the underlying protocols. If a UI requires explanation, simplify it.
2. **Identity is the product.** Every feature should reinforce the idea that your identity is portable, trustworthy, and yours.
3. **Partner platforms are the primary context.** Most users encounter Certified inside other apps, not on certified.app. Design with that in mind.
4. **No jargon in user-facing UI.** See DESIGN_SYSTEM.md Section 15 for the full translation table. When in doubt, describe the benefit, not the mechanism.
5. **Trust through design.** Clean, professional, institutional — but not cold. See DESIGN_SYSTEM.md for the full visual language.

---

## Links

- **Certified app:** [certified.app](https://certified.app)
- **Hypercerts documentation:** [hypercerts-v02-documentation.vercel.app](https://hypercerts-v02-documentation.vercel.app)
- **What is Certified (docs):** [hypercerts-v02-documentation.vercel.app/getting-started/what-is-certified](https://hypercerts-v02-documentation.vercel.app/getting-started/what-is-certified)
- **Design system:** [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)
