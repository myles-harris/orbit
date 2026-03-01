# orbit
mobile app for staying connected
Orbit — Orbit Mobile App (Monorepo)

Overview
Orbit is a mobile-first group video calling app (Orbit) built as a monorepo:
- apps/server: Node.js + Express API (PERN backend) with scheduling worker
- apps/mobile: React Native (Expo) client for iOS/Android
- packages/shared: Shared DTOs and lightweight API client

Key Integrations (stubs provided)
- Twilio Verify (OTP) and Twilio Programmable Video
- Push Notifications: FCM (Android) and APNs (iOS)
- PostgreSQL via Prisma ORM

Getting Started
1) Copy env template:
   cp .env.example .env

2) Server:
   - Install deps: (from repo root) npm install (uses workspaces)
   - Run dev server: npm run dev -w apps/server

3) Mobile (Expo):
   - Install deps: npm install -w apps/mobile
   - Start app: npm run start -w apps/mobile

Structure
- apps/server: Express app, REST endpoints, Prisma schema, worker cron
- apps/mobile: Expo app, auth flow (phone/OTP), groups, call screen
- packages/shared: DTOs, API types, minimal fetch client

PRD Coverage (MVP skeleton)
- Auth: phone + OTP, JWT issuance (server), persisted on device
- Groups: create/join/leave, cadence config, owner/member roles
- Calls: call-now, current, history, Twilio token endpoint
- Scheduling: backend-only randomization; worker triggers activation
- Notifications: push adapters (FCM/APNs) only (no SMS invites)
- Offline Mode: AsyncStorage for auth, user, groups, call state

Monorepo Scripts (root)
- npm run dev:server — start backend in dev
- npm run start:mobile — start Expo bundler

Environments
See .env.example for all variables required across services. Configure values for local development before running.

CI/CD
- GitHub Actions templates (build/test placeholders)
- Expo EAS or Fastlane can be wired to release pipelines (not committed)

Security Notes
- Never commit .env files or credentials
- JWT short-lived, refresh tokens supported (skeleton provided)

License
Proprietary — All rights reserved.