# Certified

Certified is a passwordless identity platform built on [AT Protocol](https://atproto.com), operated by the [Hypercerts Foundation](https://hypercerts.org). It lets users create a single account that works across partner applications with full data portability and no vendor lock-in.

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
| `/organizations` | Organization management |
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
| `PUBLIC_URL` | Production | Public URL of the app (used for OAuth client_id and redirect URIs) |
| `COOKIE_SECRET` | Production | Secret for signing session cookies (`openssl rand -hex 32`) |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis REST token |
| `ATPROTO_PRIVATE_KEY` | No | EC private key for confidential client auth |
| `RESEND_API_KEY` | No | Resend API key for feedback emails |

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

See [LICENSE](LICENSE) for details.
