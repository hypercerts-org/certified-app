# Hypercerts Skill Map

Use this map to choose the smallest focused skill for a user's task. This file is the catalog's source of truth for focused skill names, source repositories, and direct-directory fallback URLs.

| User task | Focused skill | Source repository install | Direct-directory fallback |
| --- | --- | --- | --- |
| Implement ePDS login, AT Protocol OAuth, OTP login, email-first auth, PAR, PKCE, DPoP, `NodeOAuthClient`, or OAuth client metadata flows | `epds-login` | `npx skills add hypercerts-org/ePDS --skill epds-login --yes` | `https://github.com/hypercerts-org/ePDS/tree/main/.agents/skills/epds-login` |
| Query Hypercerts Hyperindex GraphQL, read `org.hypercerts.*` or `app.certified.*` records, choose hosted endpoints, or build filters, pagination, sorting, and consumer query workflows | `hyperindex` | `npx skills add GainForest/hyperindex --skill hyperindex --yes` | `https://github.com/GainForest/hyperindex/tree/main/.agents/skills/hyperindex` |
| Build AT Protocol apps that read and write group-owned records through Certified Group Service, including group registration/import, member and role management, `app.certified.group.*` records, group repo writes, blob uploads, audit logs, or API keys | `app-development-with-cgs` | `npx skills add hypercerts-org/certified-group-service --skill app-development-with-cgs --yes` | `https://github.com/hypercerts-org/certified-group-service/tree/main/.agents/skills/app-development-with-cgs` |
| Use Certified Organization Labeler / OrgLabeler labels to filter certified actors, hide likely test data, show actor quality tiers, or debug why an actor was labeled | `orglabeler` | `npx skills add hypercerts-org/orglabeler --skill orglabeler --yes` | `https://github.com/hypercerts-org/orglabeler/tree/main/.agents/skills/orglabeler` |
| Build applications with Hypercerts lexicons, consume `@hypercerts-org/lexicon`, read or write Hypercerts records on AT Protocol, or use generated TypeScript types and validators | `building-with-hypercerts-lexicons` | `npx skills add hypercerts-org/hypercerts-lexicon --skill building-with-hypercerts-lexicons --yes` | `https://github.com/hypercerts-org/hypercerts-lexicon/tree/main/.agents/skills/building-with-hypercerts-lexicons` |

After selecting a skill, use [the install reference](install.md) for the generic install workflow, fallback handling, and `SKILL.md` lookup steps.
