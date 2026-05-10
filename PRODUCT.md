# Product

## Register

product

> Certified is a mixed surface, product-led. The gated app (`/`, `/settings`, `/groups`, `/profile/[did]`, `/connected-apps`) is the primary register and PRODUCT.md is written for it. The brand register applies on `/welcome` and `/about`, where design is allowed to lead — long-form content, hero typography, identity-forward sections. Anywhere a task is genuinely ambiguous, default to product.

## Users

The primary user is an **end user signing in to a partner application via Certified**. They arrive on `/welcome` from a partner app's sign-in screen, often without prior knowledge of AT Protocol, and need to create an identity, complete sign-in, and return to the partner app with minimal friction. After that first session they may rarely revisit, except to manage settings, connected apps, or groups.

A secondary user is the **atproto-fluent power user or group admin** — someone managing organization membership, linking a wallet, or curating profile data. They tolerate (and reward) more depth, but the design must not optimize for them at the expense of the primary user.

The shared context: people are using Certified at a moment of trust transfer — they are about to hand an identity to a partner app, or they are managing where their identity already travels. The interface is the visible surface of that trust contract, so it cannot feel improvised, branded-over, or decorative-first.

## Product Purpose

Certified is a passwordless identity platform built on AT Protocol, operated by the Hypercerts Foundation. It exists so that one identity can travel across partner applications with full data portability and no vendor lock-in. The user's records live on a Personal Data Server (`certified.one` by default, or any external atproto host) and the app itself is a thin OAuth client and BFF — it never holds tokens in the browser, never owns the user's data, and proxies everything through the user's PDS.

Success looks like: a user lands on `/welcome` from a partner app, creates an identity in under a minute, and returns to the partner app feeling that the foundation behind this is serious and durable. Later, when they revisit `/settings` or `/groups`, the app rewards them with quiet competence rather than novelty.

## Brand Personality

**Confident, principled, plain.** Three words, no synonyms.

- **Confident** — speaks with conviction about user sovereignty and data portability. Does not hedge, apologize, or oversell.
- **Principled** — every visual and copy choice is downstream of a stance: passwordless, portable, foundation-run, no lock-in. The aesthetic carries the principles.
- **Plain** — no jargon shields, no marketing froth, no decorative flourish. Plain language is a moral stance, not a design constraint.

Voice: foundation-run public infrastructure, not a startup. Concise sentences, second person sparingly, never exclamation marks, never emojis. Refers to atproto concepts (DIDs, handles, PDSes) by name and explains them once, in plain terms, where they first appear — never hides them, never decorates them.

Emotional goal: the user should leave the interface feeling **calm and respected**, not impressed. If the dominant feeling is "wow", the design has overreached.

## Anti-references

The strongest trap to avoid is the **crypto-wallet aesthetic**. Certified is not a wallet, even though `/settings/wallet` can link one. Specifically reject:

- Neon accents on black backgrounds; gradient meshes; gradient text.
- Glassmorphism, blurred translucent cards, "Web3" depth tricks.
- Cyberpunk or terminal-coded type pairings used decoratively.
- Animated gradients, particle fields, orbiting-token hero treatments used as identity (the existing `orbiting-logos` is a partner-logo affordance, not a vibe — keep it disciplined).
- Copy that frames identity as "ownership", "your keys your X", or any other phrasing borrowed from crypto self-custody marketing. Certified is about portability, not custody.

Secondary anti-references, weaker but still worth naming:

- **SaaS-cream auth-as-a-service**: Auth0 / Clerk / WorkOS lane — cream backgrounds, navy with warm-orange accent, illustrated heroes, "developer-first" framing. Certified is for end users first.
- **Bluesky / consumer-social tone**: rounded cards, friendly blue accents, app-store-y hero. Certified is identity infrastructure that happens to share a protocol with Bluesky, not a social product.
- **Generic foundation / NGO**: stock photography, vague "empowering communities" copy, navy-and-gold credibility palette. The credibility has to be earned by the work, not signaled by the palette.

## Design Principles

1. **Quiet trust over loud marketing.** The interface should read as durable infrastructure that has been running for a decade. If a flourish exists only to impress, remove it. The brand register on `/welcome` is allowed to be more expressive, but never at the cost of feeling settled and serious.
2. **Plain language is a design element.** Copy is not a decoration applied at the end — it carries the trust contract. Explain DIDs, handles, and PDSes in human terms the first time they appear on a screen, never with disclaimers or jargon shields.
3. **Product is the substrate; brand frames the entrance.** `/welcome` and `/about` may lead with identity-forward typography and long-form content. The gated app should feel like the same foundation, but quieter — settings, groups, and profiles are tools, not surfaces to perform on.
4. **Visibly not-a-wallet.** Every color, type, and motion choice should put deliberate distance between Certified and crypto-wallet conventions. When a decision is borderline, pick the option a wallet would not.
5. **Accessibility is a cognitive on-ramp, not just a contrast check.** A11y here means both an atproto-novice and an atproto-fluent user get oriented on the same screen. Plain copy, predictable structure, and inline explanations carry as much weight as AA contrast.

## Accessibility & Inclusion

Floor: **WCAG 2.2 AA**, with deliberate **atproto-fluency on-ramps** layered on top.

- AA contrast across all text and interactive states; focus rings always visible (`:focus-visible` styles already exist in `globals.css`).
- Keyboard-complete on every flow, including OAuth callback and group management.
- `prefers-reduced-motion` respected — motion is decoration, never load-bearing.
- The skip-to-main link in `layout.tsx` stays.
- Atproto concepts (DID, handle, PDS, group, attestation) get a one-line plain-language gloss the first time they appear on a screen. Power users can ignore the gloss; novices can rely on it.
- Forms surface validation in plain language ("This handle is already taken at certified.one"), never as opaque error codes.
- No flow assumes color alone conveys meaning — pair color with icon or label for status, success, and error.
