# Certified

Certified is a passwordless identity platform built on [AT Protocol](https://atproto.com), operated by the [Hypercerts Foundation](https://hypercerts.org). It lets users create an account that works across partner applications with full data portability and no vendor lock-in.

**Live:** [certified.app](https://certified.app)

## Architecture

- **certified.app** -- web application for creating and managing AT Protocol identities
- **certified.one** -- ePDS (extended Personal Data Server) that hosts user data

When a user signs up, they get an AT Protocol identity and a Personal Data Server hosted at certified.one. Their profile and data travel with them to any app that supports AT Protocol.

### Tech stack

- [Next.js](https://nextjs.org) (App Router) on [Vercel](https://vercel.com)
- [AT Protocol](https://atproto.com) OAuth with `@atproto/oauth-client-node`
- [Upstash Redis](https://upstash.com) for session and OAuth state persistence
- [Tailwind CSS](https://tailwindcss.com) + custom CSS

### Routing

| Route | Description |
|-------|-------------|
| `/welcome` | Landing page (unauthenticated users redirected here from `/`) |
| `/` | Profile dashboard (authenticated) |
| `/settings` | Account settings |
| `/connected-apps` | Manage connected applications |
| `/groups` | Group management |
| `/about` | About Certified and the Hypercerts Foundation |
| `/terms` | Terms of Service |
| `/privacy` | Privacy Policy |
| `/dsa` | Digital Services Act compliance |

Middleware redirects unauthenticated users from `/` to `/welcome`.

## Getting started

### Prerequisites

- Node.js 18+
- An [Upstash Redis](https://console.upstash.com) database (free tier works)

### Setup

```bash
# Clone the repository
git clone https://github.com/hypercerts-org/certified-app.git
cd certified-app

# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
```

Edit `.env.local` with your values:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_PDS_URL` | Yes | PDS / handle resolver URL (default: `https://certified.one`) |
| `PUBLIC_URL` | Recommended in production | Canonical app origin used for OAuth metadata and callbacks |
| `VERCEL_BRANCH_URL` | Vercel-provided fallback | Stable branch hostname used when `PUBLIC_URL` is absent |
| `VERCEL_URL` | Vercel-provided fallback | Commit deployment hostname used when the first two values are absent |
| `COOKIE_SECRET` | Production | Secret for signing session cookies (`openssl rand -hex 32`) |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis REST token |
| `ATPROTO_PRIVATE_KEY` | No | EC private key for confidential client auth |
| `RESEND_API_KEY` | No | Resend API key for feedback emails |

OAuth URL precedence is `PUBLIC_URL` → `VERCEL_BRANCH_URL` → `VERCEL_URL`. The Vercel variables are server-side hostname-only system values and do not need `NEXT_PUBLIC_` aliases. The selected metadata endpoint—and JWKS endpoint when confidential auth is enabled—must be publicly reachable by the authorization server, so Vercel Deployment Protection can prevent preview login. Deployments participating in one callback flow must share compatible Redis configuration; distinct canonical OAuth origins should use separate Redis databases because saved OAuth sessions are not namespaced by `client_id`.

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```

## License

Licensed under the [Apache License, Version 2.0](LICENSE). Section 4 of the license sets the conditions for redistribution; under section 4(d), a modified version you distribute must include the attribution notices from the [NOTICE](NOTICE) file that pertain to it.

Versions from before the change to Apache-2.0 were licensed under MIT. The [NOTICE](NOTICE) file keeps the MIT terms for that earlier code.

Some agent skills are copied from other projects and keep their licenses:

- `animation-performance`, `apple-design`, `break-ui`, `emil-design-eng`, `find-animation-opportunities`, `improve-animations`, `mobile-native` and `review-animations` in `.claude/skills/` come from [emilkowalski/skills](https://github.com/emilkowalski/skills), under MIT.
- `react-best-practices`, `react-view-transitions`, `web-design-guidelines` and `writing-guidelines` in `.claude/skills/` come from [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), under MIT.
- `impeccable` in `.agents/skills/` comes from [pbakaus/impeccable](https://github.com/pbakaus/impeccable), under Apache-2.0. It bundles a build of [modern-screenshot](https://github.com/qq15725/modern-screenshot), under MIT. Its `NOTICE.md` and `scripts/modern-screenshot.umd.js.LICENSE.txt` were added here by hand. `npx skills update` replaces the folder, so add them back after an update.

The licenses don't cover the logos and wordmarks in this repository, such as the Certified brandmark and wordmark and the partner logos. They belong to their owners.
