# Orbit

Mobile app for staying connected.

If you're not great at making the time to catch up with your people,

Orbit will make it for you.

## Join the beta

Orbit is in iOS beta. From your iPhone:

1. Install [TestFlight](https://apps.apple.com/us/app/testflight/id899247664)
2. [Join the Orbit beta](https://testflight.apple.com/join/Vh3vUD4Y)

Requires iOS 17.2 or later. Orbit needs camera, microphone, and notification access for calls to work.

Both links need to open on the iPhone you'll be testing with — if you're on desktop, open this page on your phone.

Feedback: use **Send Beta Feedback** in TestFlight, or open an issue here.

Android beta is not yet available.

## Stack

- **`apps/server`** — Node.js + Express API, BullMQ/Redis scheduling worker, Prisma ORM (PostgreSQL)
- **`apps/mobile`** — React Native (Expo) client for iOS/Android
- **`packages/shared`** — Shared DTOs and lightweight API client

## Key integrations

- **Video calls** — Daily.co (`@daily-co/react-native-daily-js`)
- **Auth** — Twilio Verify (OTP), JWT (short-lived + refresh)
- **Push notifications** — FCM (Android) and APNs (iOS), including Live Activities
- **Background jobs** — BullMQ + Redis for call scheduling and activation

## Getting started

```bash
# 1. Install deps (from repo root — uses workspaces)
npm install

# 2. Copy env template and fill in values
cp apps/server/.env.example apps/server/.env

# 3. Start backend
npm run dev:server

# 4. Start mobile bundler
npm run start:mobile
```

See [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) for full environment setup (Redis, PostgreSQL, APNs, FCM).

## Monorepo scripts

| Script | What it does |
|---|---|
| `npm run dev:server` | Start backend in watch mode |
| `npm run start:mobile` | Start Expo bundler |
| `npm test` | Run server test suite |
| `npm run build` | Compile server + typecheck mobile |

## Structure

```
apps/
  server/     Express app, REST endpoints, Prisma schema, BullMQ worker
  mobile/     Expo app — auth, groups, call screen, notifications
packages/
  shared/     DTOs, API types, minimal fetch client
docs/         Setup guides, APNS config, PRD
design/       Prototype assets
```

## CI/CD

- GitHub Actions runs `npm test -w apps/server` and `tsc --noEmit` on mobile on every push
- Production deploys to Railway via `Dockerfile`
- Mobile builds via EAS (`eas build`)

## License

Proprietary — All rights reserved.
