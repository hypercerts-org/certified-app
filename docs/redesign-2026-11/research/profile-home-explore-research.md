# Home, Profile, Explore: best-practice research for certified.app

Researched 2026-11-13. Primary sources where reachable; secondary sources are marked (2nd). Read.cv no longer exists (Perplexity bought it and shut it down in January 2025, https://techcrunch.com/2025/01/17/perplexity-acquires-read-cv-a-social-media-platform-for-professionals/), and Every.org returned 429 errors, so its points come from search snippets. Behance was not covered.

## 1. Account Home

- **Lead with the account, then a short list of what it holds, not metrics.** Google Account's 2025 redesign opens with avatar, name and email in a header that stays docked as you scroll. Below it sits one column of sections, each with a one-line description. (9to5Google (2nd), https://9to5google.com/2025/07/16/google-account-expressive-redesign/)
- **Replace count tiles with one status line and up to three next actions, most important first. Hide the actions block when nothing is pending.** Google Security Checkup shows a single green or warning state, lists the most important recommendations first, and drops "Recommended actions" when there are none. (Google Help, https://support.google.com/accounts/answer/46526)
- **Give new accounts a few dismissible starter tasks instead of empty counters, and hide secondary panels until there is something in them.** GitHub's new-user dashboard shows three "Getting Started" tasks, each of which can be dismissed. It hides the right sidebar for the first 30 days. (GitHub Changelog, https://github.blog/changelog/2025-06-12-new-user-dashboard-refresh)
- **Keep Home about your own account, and give "what others did" its own place.** In 2026 GitHub moved the feed into a separate tab to keep it "distinct from your productivity-focused dashboard". (GitHub Changelog, https://github.blog/changelog/2026-10-01-new-dashboard-experience-now-the-default)
- **List the apps the account has signed in to, each with a "Last used" date. Put apps it could use in a collapsed panel below.** GOV.UK One Login's "Your services" page does exactly this. (GOV.UK One Login, https://sign-in.service.gov.uk/about/signed-in-experience)
- **Give each connected app a "stop using" control.** Apple Account lists "Apps Using Your Apple Account" and lets you stop using each one. (Apple Support, https://support.apple.com/102571)
- **While data loads, never show "0" or "No records". When a section really is empty, say what belongs there and link the action that fills it.** (NN/g, https://www.nngroup.com/articles/empty-state-interface-design/)

## 2. Public profile

- **Put a social-proof line in the header that names endorsers the viewer already follows.** Bluesky shows "followed by [people you follow]" on profiles, which went live in mid-2024 (app.bsky.graph.getKnownFollowers). (Gigazine (2nd), https://gigazine.net/gsc_news/en/20240613-bluesky-update-thread)
- **Make every trust mark open a panel that names who granted it and when. Use mark shape to show who verified, not colour. Never let a mark be bought.** Bluesky does this with a round check from Bluesky itself and a scalloped mark for Trusted Verifiers. Tapping either shows the issuer, and checks cannot be paid for. (Bluesky, https://bsky.social/about/blog/04-21-2025-verification)
- **Keep attested facts apart from what the account says about itself.** LinkedIn groups verifications under "About this profile" (LinkedIn Help, https://www.linkedin.com/help/linkedin/answer/a6275638). The German EUDI wallet takes the issuer's name from its registration certificate, never from self-supplied display data (EUDI dev guide, https://bmi.usercontent.opencode.de/eudi-wallet/developer-guide/eaa/credential_styling_guidance).
- **Show a "verified website" state only when the profile's website matches the domain handle.** GitHub shows an organisation's "Verified" badge only when the website and email on the profile match a verified domain. (GitHub Docs, https://docs.github.com/en/organizations/managing-organization-settings/verifying-or-approving-a-domain-for-your-organization)
- **Show endorsements as statements with an endorser, a subject, criteria or context, and a date, not as a tally.** Open Badges 3.0 frames a credential as an issuer asserting that a subject met defined criteria (1EdTech, https://www.imsglobal.org/spec/ob/v3p0/impl). Karma stores project endorsements as attestations next to milestones (Karma docs, https://docs.gap.karmahq.xyz/how-to-guides/for-community-members).
- **Don't reduce trust to one score on a page people read.** Human Passport adds stamp weights into a score with a default threshold of 20. That score is built for apps to gate on, not for people to read. (Human Passport docs, https://docs.passport.human.tech/overview/key-terms)
- **Let owners hide individual badges.** GitHub lets people hide single achievements or turn them all off. (GitHub Changelog, https://github.blog/changelog/2022-10-07-visibility-settings-for-individual-achievements)
- **Lead the Overview with items the owner pins, and keep the tab count low.** GitHub's Overview combines a README with up to six pinned items. (GitHub Docs, https://docs.github.com/en/account-and-profile/concepts/personal-profile)
- **Let organisations reorder or hide profile sections, but keep accountability sections fixed.** Open Collective lets collectives show, hide and reorder sections, but the budget section always shows. (Open Collective docs, https://documentation.opencollective.com/getting-started/customizing-your-page-layout)
- **On mobile, use one column, shrink the header as the user scrolls, and keep the tabs pinned at the top.** Google's mobile account header stays docked while you scroll. (9to5Google (2nd), URL above)

## 3. "See it as others do"

- **Mark each profile field as public or private where it is edited, and offer a preview of the visitor's view.** Google's "About me" sets what others see field by field (Google Help, https://support.google.com/accounts/answer/6304920). LinkedIn's public-profile settings show the version non-connections see (https://www.linkedin.com/public-profile/settings (2nd description)).
- **Show a "visitor view" or "owner view" switch whenever owners look at their own profile.** GitHub owners always see their full profile, even when it is private, so without a switch they cannot see what visitors miss. (GitHub Docs, personal-profile URL above)

## 4. Explore / discovery

- **Put search first, then topic or interest entry points, then curated sets, and let the person edit their interests.** Bluesky's 2025 Explore is a search bar, then trends, then suggested accounts by interest and starter packs, with an editable interests shortcut. (TechCrunch (2nd), https://techcrunch.com/2025/04/10/blueskys-latest-update-adds-chat-reactions-and-an-explore-page-similar-to-x)
- **Merge "Featured" and "All" into one list, featured first, with the rest behind "See all".** Product Hunt replaced its separate Featured and All lists with one feed that puts featured launches on top. (Product Hunt, https://www.producthunt.com/discussions/new-on-product-hunt-product-hunt-s-latest-homepage-overhaul)
- **Rank by trust signals the viewer chose, such as endorsements from accounts they follow or trust, and say so on the page.** In Bluesky, users choose their own labelers (Bluesky docs, https://docs.bsky.app/docs/advanced-guides/moderation). Every.org surfaces nonprofits "recommended by your friends and community" (Product Hunt listing (2nd), https://www.producthunt.com/posts/every-org).
- **Leave unclaimed or empty accounts out of default and featured slots.** Every.org says unclaimed pages are "never promoted or indexed". (Every.org snippet, https://www.every.org/cs)
- **Offer View (grid or list) and Sort controls, and add time windows for anything "trending".** Are.na Explore exposes View and Sort controls (Are.na, https://www.are.na/explore). GitHub Explore filters trending by day, week or month (GitHub Changelog, https://github.blog/changelog/a-redesigned-explore-tab-on-github-mobile).
- **Use skeletons shaped like the final cards while content loads, then show empty states with an action.** (NN/g, https://www.nngroup.com/videos/skeleton-screens-vs-progress-bars-vs-spinners/, plus the empty-states article above)

## 5. Visual language

- **Earn trust through visible craft, up-front disclosure, current content and links to the wider web. Show "joined" and "last updated" dates, and link out to the domain and the PDS.** (NN/g, https://www.nngroup.com/articles/trustworthy-design/)
- **Show credentials as a flat list of labelled values, issuer first, rather than as decorative cards.** (DIF Wallet Rendering, https://identity.foundation/wallet-rendering/; EUDI guide above)
- **Keep the palette monochrome, and mark attested facts with a single seal glyph whose shape encodes who attested.** This works in dark mode without an accent colour. (Bluesky's circle and scalloped marks, Bluesky URL above)
- My judgement, not sourced: **keep the serif for names and titles and Inter for data. Use tabular numerals for counts and dates, and a monospace face for the DID.**

## 6. Recommendation for certified.app

**Home, top to bottom**
1. Identity strip: avatar, name and handle, with "View public profile" and "Edit profile". The ID (handle and DID copy controls) shrinks to one line explaining that apps use it to sign you in. The full copy pills move to an ID or settings page.
2. A "Next steps" block, shown only while something is missing: up to three dismissible tasks such as adding a profile photo and bio, adding a first activity, or signing in to a partner app.
3. Records: the three latest items as rows, with counts as inline text and a link to /records. Cut the count tiles.
4. From others: the latest endorsements, each naming the endorser and what was endorsed. When there are none, a short explainer and a share-profile action.
5. Apps: the apps signed in to, each with a "Last used" date, then a collapsed list of other apps. This needs sign-in history; if it is unavailable, keep partner tiles but mark which ones the account has used.
6. Groups: a compact list. When there are none, show one line instead of a box.

**Public profile**
1. Header: banner, avatar, name, handle with domain-verified state, bio, website. Organisations add one meta line: type, location, founded.
2. A trust line naming endorsers the viewer follows (or the viewer's trusted endorsers), followed by the total. It links to Endorsements.
3. Cut the tabs from eight to four: Overview, Activities (with projects as folders), Endorsements, About. Followers, following, lists and groups move to header counts or About sub-pages.
4. Overview: pinned activities, recent activities, a sample of endorsements received. For organisations, a short description first.
5. Owner view: a slim bar showing whether this is the visitor view, with Edit and Home links.
6. Mobile: one column, a header that shrinks on scroll, and tabs pinned at the top that scroll sideways.

**Explore**
1. Search, then a type filter (Activities, Projects, Accounts), then a scope switch between accounts I trust and everyone.
2. Sections: Featured; From accounts I follow or endorse; Recently viewed (only when it has items); then everything, sorted by newest or most endorsed. Fold the sidebar's "All" and "Featured" into this list.
3. Image-led cards for activities. Rows for accounts, each carrying the line naming endorsers the viewer knows.
4. Keep empty or unclaimed accounts out of Featured and the default sort.
5. Skeleton cards while loading. No section shows a zero state before its data arrives.
