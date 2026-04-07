# GEO Audit Report: certified.app

**Date:** 2026-04-06
**URL:** https://certified.app
**Business Type:** SaaS — Identity & Authentication Platform
**Operated By:** Hypercerts Foundation

---

## Composite GEO Score: 20/100 (Critical)

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| AI Citability & Visibility | 25% | 14/100 | 3.5 |
| Brand Authority Signals | 20% | 12/100 | 2.4 |
| Content Quality & E-E-A-T | 20% | 28/100 | 5.6 |
| Technical Foundations | 15% | 38/100 | 5.7 |
| Structured Data | 10% | 5/100 | 0.5 |
| Platform Optimization | 10% | 18/100 | 1.8 |
| **TOTAL** | **100%** | | **19.5 -> 20** |

**Score Interpretation:** The site is virtually invisible to AI search engines. The homepage — the only marketing content page — is entirely client-rendered and produces a blank loading spinner for all AI crawlers. There is no robots.txt, no sitemap, no llms.txt, no structured data, and near-zero brand presence on platforms AI models use for entity recognition.

---

## Platform Readiness

| Platform | Score | Status |
|----------|-------|--------|
| Google AI Overviews | 22/100 | Poor |
| Google Gemini | 16/100 | Critical |
| Bing Copilot | 15/100 | Critical |
| Perplexity AI | 14/100 | Critical |
| ChatGPT Web Search | 12/100 | Critical |

---

## Top Findings

### CRITICAL — Homepage is invisible to AI crawlers

The homepage component (`src/components/landing/home-client.tsx`) is marked `"use client"` and loads all sections via `next/dynamic`. The raw HTML that AI crawlers receive is:

```html
<main class="flex-1">
  <div class="loading-screen">
    <img src="/assets/certified_brandmark_black.svg" alt="" />
  </div>
  <template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>
</main>
```

No headings, no text, no links. GPTBot, ClaudeBot, PerplexityBot, and all other AI crawlers see **nothing**. The Terms, Privacy, and DSA pages are correctly server-rendered.

### CRITICAL — No crawl infrastructure exists

| File | Status |
|------|--------|
| robots.txt | 404 — Missing |
| sitemap.xml | 404 — Missing |
| llms.txt | 404 — Missing |
| canonical tags | Missing on all pages |
| OG/Twitter meta | Missing on all pages |

### CRITICAL — Zero structured data

No JSON-LD, no Microdata, no RDFa on any page. Missing: Organization, SoftwareApplication, WebSite, FAQPage, BreadcrumbList, speakable. AI models have no structured way to understand what Certified is.

### CRITICAL — Near-zero brand recognition for AI models

| Platform | Present? |
|----------|----------|
| Wikipedia/Wikidata | No |
| Reddit | No |
| YouTube | No |
| LinkedIn | Unknown |
| GitHub | Yes (34 repos, 47 followers) |
| Product Hunt / G2 / Capterra | No |

The brand name "Certified" is a common English word, making entity disambiguation nearly impossible without strong external signals.

### HIGH — Thin content with weak E-E-A-T

- Homepage: ~250 words of marketing copy (well below 300-word minimum)
- Total site content: ~7,050 words, of which ~6,800 are legal text
- No about page, no blog, no docs, no changelog
- No author bylines, no team credentials
- Zero statistics or data points anywhere
- No product screenshots

### HIGH — Subpage metadata is generic

Pages `/terms`, `/privacy`, and `/dsa` inherit the root layout defaults:
- Title: "Certified"
- Description: "Your identity, everywhere."

These should have unique, page-specific titles and descriptions.

---

## E-E-A-T Breakdown

| Dimension | Score | Key Gap |
|-----------|-------|---------|
| Experience | 3/25 | No case studies, no original data, no first-hand accounts |
| Expertise | 7/25 | No author bylines, no technical depth on landing page |
| Authoritativeness | 6/25 | No about page, no external citations, no media mentions |
| Trustworthiness | 14/25 | Strong legal pages, HTTPS, but no contact info on homepage |

---

## Citability Assessment

The highest-scoring content blocks are FAQ answers at 24-26/100. No content block on the site reaches the citation-ready threshold of 70/100. Key problems:

- Zero statistical density across the entire site
- No self-contained explanatory paragraphs (everything is 1-sentence fragments)
- No "What is Certified?" definition block
- Client-side rendering makes even the best content invisible to crawlers

---

## Technical Details

| Check | Result |
|-------|--------|
| HTTPS | Yes (required for .app TLD) |
| HSTS | Present (max-age=63072000) |
| CSP | Missing |
| X-Frame-Options | Missing |
| X-Content-Type-Options | Missing |
| SSR | Homepage: No (CSR bailout). Subpages: Yes |
| Framework | Next.js App Router on Vercel |
| Mobile | Good (Tailwind responsive, viewport meta correct) |
| URL structure | Excellent (clean, flat, descriptive) |
| LCP risk | High (homepage requires full JS execution) |
| CLS risk | Medium (no image dimensions, dynamic imports) |

---

## Prioritized Action Plan

### Quick Wins (Low effort, high impact)

| # | Action | Impact | Platforms Affected |
|---|--------|--------|--------------------|
| 1 | Create `src/app/robots.ts` allowing all crawlers + sitemap reference | Crawl infrastructure | All 5 |
| 2 | Create `src/app/sitemap.ts` listing all public routes | Page discovery | All 5 |
| 3 | Add `public/llms.txt` describing the site for AI systems | AI context | ChatGPT, Perplexity, Claude |
| 4 | Add page-specific metadata to /terms, /privacy, /dsa | Indexability | All 5 |
| 5 | Add OG and Twitter Card meta tags to all pages | Social/AI previews | All 5 |
| 6 | Add canonical URLs to all pages | Duplicate prevention | All 5 |
| 7 | Link to GitHub org from footer | Entity signal (Microsoft property) | Bing Copilot, ChatGPT |

### Medium-Term (Medium effort, critical impact)

| # | Action | Impact | Platforms Affected |
|---|--------|--------|--------------------|
| 8 | **Fix homepage SSR** — extract landing sections from `"use client"` HomeClient into server components. Keep only interactive elements (sign-in, FAQ accordion) as client islands. This is the #1 priority. | Makes all landing content visible to crawlers | All 5 |
| 9 | Add JSON-LD structured data: Organization (Hypercerts Foundation + sameAs), SoftwareApplication (Certified), WebSite, FAQPage, BreadcrumbList | Entity recognition | All 5 |
| 10 | Create an `/about` page (800-1200 words): who operates Certified, team, mission, AT Protocol explanation, founding story | E-E-A-T, citability | All 5 |
| 11 | Add a "What is Certified?" definition block to the homepage — 2-3 self-contained sentences an AI can extract as a canonical answer | Citability | All 5 |
| 12 | Add statistics and specificity: partner app count, account creation time, protocol details, uptime, any measurable claims | Citability | All 5 |
| 13 | Add security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) via next.config.ts | Security/trust | Google, Bing |
| 14 | Register with Bing Webmaster Tools + implement IndexNow | Bing indexing | Bing Copilot |

### Strategic (High effort, long-term impact)

| # | Action | Impact | Platforms Affected |
|---|--------|--------|--------------------|
| 15 | Pursue Wikipedia/Wikidata entry for Hypercerts Foundation | Entity recognition (strongest signal) | ChatGPT, Perplexity, Gemini |
| 16 | Build content hub: blog/docs covering "What is AT Protocol?", "Decentralized identity explained", "Certified vs. Sign in with Google", etc. | Topical authority | All 5 |
| 17 | Create YouTube explainer video(s) | Google ecosystem presence | Gemini, Google AIO |
| 18 | Seed community presence: Reddit (r/selfhosted, r/privacy, r/atproto), Product Hunt, developer forums | Brand mentions | Perplexity, ChatGPT |
| 19 | Consider a more distinctive brand qualifier (e.g., "Certified by Hypercerts" or "Certified ID") in public-facing contexts | Entity disambiguation | All 5 |

---

## Recommended JSON-LD (Ready to Implement)

### Organization — Root Layout

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Hypercerts Foundation",
  "legalName": "Hypercerts Foundation",
  "url": "https://hypercerts.org",
  "logo": "https://certified.app/assets/certified_brandmark_black.png",
  "description": "A Delaware nonstock corporation that develops open infrastructure for the hypercerts ecosystem, operating the Certified identity platform.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "1209 Orange St.",
    "addressLocality": "Wilmington",
    "addressRegion": "DE",
    "postalCode": "19801",
    "addressCountry": "US"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "email": "legal@hypercerts.org",
    "contactType": "legal"
  },
  "sameAs": [
    "https://github.com/hypercerts-org"
  ]
}
```

### SoftwareApplication — Homepage

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Certified",
  "url": "https://certified.app",
  "applicationCategory": "SecurityApplication",
  "operatingSystem": "Web",
  "description": "Create your Certified identity and use one account across partner apps. No passwords, no lock-in. Built on AT Protocol for decentralized identity.",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "creator": {
    "@type": "Organization",
    "name": "Hypercerts Foundation",
    "url": "https://hypercerts.org"
  },
  "isAccessibleForFree": true
}
```

### WebSite — Root Layout

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Certified",
  "url": "https://certified.app",
  "description": "Create your Certified identity and use one account across partner apps. No passwords, no lock-in.",
  "publisher": {
    "@type": "Organization",
    "name": "Hypercerts Foundation"
  },
  "inLanguage": "en"
}
```

---

## Recommended llms.txt

```
# Certified

> Certified is an identity platform built on AT Protocol, operated by Hypercerts Foundation. It provides passwordless authentication and portable user profiles across partner applications.

## Main

- [Home](https://certified.app): Create your Certified identity and use one account across partner apps
- [Terms of Service](https://certified.app/terms): Service terms for Certified and certified.one infrastructure
- [Privacy Policy](https://certified.app/privacy): Data processing practices, GDPR compliance, cookie policy
- [DSA Compliance](https://certified.app/dsa): Digital Services Act compliance information

## About

- [Hypercerts Foundation](https://hypercerts.org): Parent organization building open-source protocols for impact funding
- [GitHub](https://github.com/hypercerts-org): Open source repositories for Certified and related projects

## Partner Apps

- [Ma Earth](https://maearth.com): Collective funding for regenerating Earth
- [GainForest](https://gainforest.earth): AI-powered forest monitoring and conservation rewards
- [Simocracy](https://simocracy.org): Democratic governance with verifiable identity
- [Hyperboards](https://hyperboards.org): Visual leaderboards for impact contributions
```

---

## Key Source Files

| File | Issue |
|------|-------|
| `src/components/landing/home-client.tsx` | `"use client"` — causes SSR bailout, all landing content invisible to crawlers |
| `src/app/page.tsx` | Renders HomeClient — homepage has no server-rendered content |
| `src/app/layout.tsx` | Missing: OG tags, Twitter cards, canonical, JSON-LD, security headers |
| `src/app/terms/page.tsx` | No metadata export (inherits generic defaults) |
| `src/app/privacy/page.tsx` | No metadata export (inherits generic defaults) |
| `src/app/dsa/page.tsx` | No metadata export (inherits generic defaults) |
| `next.config.ts` | No security headers configured |
| `public/` | Missing: robots.txt, sitemap.xml, llms.txt |

---

*Generated by GEO Audit Tool — 2026-04-06*
