# Orbit Mobile App - Development Status

## Overview
This document tracks the development progress of the Orbit mobile application according to the PRD requirements.

---

## ✅ Completed (Backend)

### 1. Database Schema
- ✅ Fixed Prisma schema with proper relations
- ✅ Added User model with owned_groups relation
- ✅ Added Group model with owner relation and Invite relation
- ✅ Added GroupMember with unique constraint on (group_id, user_id)
- ✅ Added CallSession with proper indexes
- ✅ Added CallParticipant for tracking who joins/leaves calls
- ✅ Added PushDevice with unique token constraint
- ✅ **NEW:** Added Invite model for invite codes (code, expires_at, used_by)
- ✅ Added cascading deletes for data integrity
- ✅ Added indexes for performance

**Location:** [apps/server/prisma/schema.prisma](apps/server/prisma/schema.prisma)

### 2. Environment Configuration
- ✅ Created `.env.example` with all required variables
- ✅ Created `.env` file with dev defaults
- ✅ Configured Twilio credentials (Account SID, Auth Token, Verify SID, API Keys)
- ✅ Configured push notification settings (FCM, APNs)
- ✅ Configured JWT secrets and expiry
- ✅ Configured scheduler settings

**Location:** [apps/server/.env.example](apps/server/.env.example)

### 3. Twilio Verify Integration (OTP)
- ✅ Implemented real Twilio Verify API integration
- ✅ Graceful fallback to stub mode when credentials not configured
- ✅ `requestOtp()` sends SMS verification code
- ✅ `verifyOtp()` validates code via Twilio Verify API
- ✅ Dev mode accepts any 6-digit code when Twilio not configured

**Location:** [apps/server/src/services/twilioVerify.ts](apps/server/src/services/twilioVerify.ts)

### 4. Twilio Video Integration
- ✅ Implemented Twilio Video Access Token generation
- ✅ `createParticipantToken()` creates proper Twilio Video tokens
- ✅ `createRoom()` creates or retrieves Twilio Video rooms
- ✅ `closeRoom()` ends video rooms when call duration expires
- ✅ Configured for "group" room type (max 10 participants)
- ✅ Graceful fallback to stub tokens when credentials not configured

**Location:** [apps/server/src/services/twilioVideo.ts](apps/server/src/services/twilioVideo.ts)

### 5. Push Notifications (FCM & APNs)
- ✅ Implemented Firebase Cloud Messaging for Android
- ✅ Implemented Apple Push Notification Service for iOS
- ✅ `sendPushTokens()` sends to multiple devices by platform
- ✅ `sendApns()` sends iOS notifications with proper payload
- ✅ `sendFcm()` sends Android notifications via FCM HTTP API
- ✅ `sendSms()` fallback via Twilio SMS
- ✅ Graceful stub mode when credentials not configured

**Location:** [apps/server/src/services/notifications.ts](apps/server/src/services/notifications.ts)

### 6. Scheduler Service
- ✅ `generateScheduledCalls()` creates random call times for all groups
- ✅ `generateCallsForGroup()` handles daily/weekly cadences
- ✅ Daily cadence: 1 call per day at random time
- ✅ Weekly cadence: N calls spread across random days
- ✅ `getRandomTime()` generates random time within bounds
- ✅ `getRandomTimesForWeek()` ensures calls on different days
- ✅ `activateDueCalls()` checks every minute for scheduled calls to start
- ✅ `activateCall()` creates Twilio room and sends push notifications
- ✅ `closeExpiredCalls()` automatically ends calls after duration
- ✅ Timezone-aware scheduling

**Location:** [apps/server/src/services/scheduler.ts](apps/server/src/services/scheduler.ts)

### 7. Scheduler Worker
- ✅ Runs every hour to generate scheduled calls
- ✅ Runs every minute to activate due calls
- ✅ Runs every minute to close expired calls
- ✅ Can be enabled/disabled via `SCHEDULER_ENABLED` env var
- ✅ Can run as standalone process or integrated with main server

**Location:** [apps/server/src/worker/scheduler.ts](apps/server/src/worker/scheduler.ts)

### 8. API Routes - Authentication
- ✅ `POST /auth/request-otp` - Send OTP via Twilio Verify
- ✅ `POST /auth/verify-otp` - Verify OTP and create/login user
- ✅ JWT access + refresh tokens issued on successful verification

**Location:** [apps/server/src/routes/auth.ts](apps/server/src/routes/auth.ts)

### 9. API Routes - User Profile
- ✅ `GET /me` - Get current user profile
- ✅ `PATCH /me` - Update username/timezone
- ✅ `POST /devices/register-push` - Register push notification token
- ✅ `DELETE /devices/register-push` - Unregister push token

**Location:** [apps/server/src/routes/me.ts](apps/server/src/routes/me.ts)

### 10. API Routes - Groups
- ✅ `POST /groups` - Create group (owner)
- ✅ `GET /groups` - List user's groups
- ✅ `GET /groups/:id` - Get group details
- ✅ `PATCH /groups/:id` - Update group settings (owner only)
- ✅ `DELETE /groups/:id` - Delete group (owner only)
- ✅ **NEW:** `POST /groups/:id/invite` - Generate invite code (owner only)
- ✅ **NEW:** `POST /groups/:id/join` - Join group with invite code
- ✅ `POST /groups/:id/leave` - Leave group

**Location:** [apps/server/src/routes/groups.ts](apps/server/src/routes/groups.ts)

### 11. API Routes - Calls
- ✅ `POST /groups/:id/call-now` - Start immediate call (any member)
  - Creates Twilio room
  - Sends push notifications to all members
  - Prevents duplicate active calls
- ✅ `GET /groups/:id/calls/current` - Get active call with participants
- ✅ `GET /groups/:id/calls/history` - Get past calls with stats
- ✅ `POST /groups/:id/calls/:callId/join-token` - Get Twilio access token
  - Validates user is member
  - Records participant joining
  - Returns token + room details
- ✅ **NEW:** `POST /groups/:id/calls/:callId/leave` - Record participant leaving

**Location:** [apps/server/src/routes/calls.ts](apps/server/src/routes/calls.ts)

### 12. Invite System
- ✅ Invite model in database with code, expiry, usage tracking
- ✅ Generate 8-character unique codes
- ✅ 7-day expiration
- ✅ One-time use tracking
- ✅ Deep link format: `orbit://invite/{CODE}`
- ✅ Owner-only invite creation
- ✅ Validation on join (expired, already used, wrong group)

---

## 📱 Completed (Mobile)

### 1. Dependencies Installed
- ✅ React Navigation (native, stack, bottom-tabs)
- ✅ React Native Screens & Safe Area Context
- ✅ Expo Camera & AV for media permissions
- ✅ expo-notifications (already present)
- ✅ expo-secure-store (already present)
- ✅ AsyncStorage (already present)

### 2. Basic Authentication Flow
- ✅ Phone number + OTP login UI
- ✅ Username input
- ✅ Token storage in SecureStore
- ✅ API client integration

**Location:** [apps/mobile/App.tsx](apps/mobile/App.tsx)

---

## 🚧 Remaining Work

### Mobile App (High Priority)

#### 1. Navigation Structure
- [ ] Set up Stack Navigator for main flow
- [ ] Set up Bottom Tab Navigator for authenticated screens
- [ ] Configure deep linking for invite codes (`orbit://invite/{CODE}`)
- [ ] Configure deep linking for call notifications

#### 2. Screens to Build
- [ ] **Home Screen** - List of user's groups
- [ ] **Group Detail Screen** - Show group info, members, call history
- [ ] **Create Group Screen** - Form to create new group
- [ ] **Group Settings Screen** - Edit cadence, duration (owner only)
- [ ] **Call Screen** - Video call interface with Twilio Video
- [ ] **Profile/Settings Screen** - Edit username, timezone, logout

#### 3. Twilio Video Integration
- [ ] Research React Native Twilio Video alternatives
  - Note: Official `@twilio/video-react-native` doesn't exist
  - Options: `react-native-twilio-video-webrtc` or WebRTC wrapper
- [ ] Install and configure video SDK
- [ ] Implement camera/microphone permissions
- [ ] Build participant grid UI
- [ ] Handle join/leave events
- [ ] Display call timer
- [ ] Show participant list

#### 4. Push Notifications
- [ ] Configure Expo push notification credentials
- [ ] Request notification permissions on app start
- [ ] Register device token with backend
- [ ] Handle foreground notifications (show in-app alert)
- [ ] Handle background notifications (open call screen)
- [ ] Handle notification tap (deep link to call)

#### 5. Group Management
- [ ] Create group flow with cadence selection
- [ ] Invite members (share code via SMS/clipboard)
- [ ] Join group via invite code
- [ ] Leave group confirmation
- [ ] Delete group confirmation (owner only)

#### 6. Call Features
- [ ] "Call Now" button on group detail
- [ ] Join active call from notification
- [ ] Join active call from group detail
- [ ] Leave call button
- [ ] Auto-dismiss when call ends
- [ ] Reconnection handling

#### 7. Offline Mode
- [ ] Cache groups list in AsyncStorage
- [ ] Cache user profile in AsyncStorage
- [ ] Sync on reconnect
- [ ] Show offline indicator

#### 8. UI/UX Polish
- [ ] Loading states for all API calls
- [ ] Error handling and user-friendly messages
- [ ] Empty states (no groups, no calls)
- [ ] Pull-to-refresh for groups list
- [ ] Call history with duration display
- [ ] Settings for timezone selection

### Backend (Medium Priority)

#### 1. Database Setup
- [ ] Start PostgreSQL locally or use cloud instance
- [ ] Run `npx prisma migrate dev` to create tables
- [ ] Generate Prisma client: `npx prisma generate`
- [ ] Verify database connection

#### 2. Refresh Token Flow
- [ ] Create `/auth/refresh` endpoint
- [ ] Implement token rotation logic
- [ ] Add auto-refresh to mobile API client

#### 3. Input Validation
- [ ] Add Zod schemas for all request bodies
- [ ] Validate phone numbers (E.164 format)
- [ ] Validate usernames (length, characters)
- [ ] Validate group settings (duration limits, etc.)

#### 4. Error Handling
- [ ] Standardize error response format
- [ ] Add proper HTTP status codes everywhere
- [ ] Log errors with context for debugging

#### 5. Testing
- [ ] Unit tests for scheduler randomization logic
- [ ] Integration tests for API routes
- [ ] End-to-end test for call flow

### DevOps (Low Priority)

#### 1. Documentation
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Setup guide for development
- [ ] Deployment guide
- [ ] Twilio setup instructions

#### 2. Production Readiness
- [ ] Replace in-memory scheduler with durable queue (Bull/BullMQ)
- [ ] Add rate limiting on auth endpoints
- [ ] Add monitoring/logging (Sentry, LogRocket)
- [ ] Database backups
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Environment-specific configs

---

## 🔧 Known Issues

### Backend
1. **Database not initialized** - PostgreSQL needs to be running and migrations applied
2. **Twilio credentials** - Need real Twilio account for production
3. **Push notification credentials** - Need FCM server key and APNs certificates
4. **Scheduler is in-memory** - Not durable, will lose state on restart

### Mobile
1. **Twilio Video SDK** - No official React Native package, need alternative
2. **No navigation** - Still single-file app
3. **No push notification setup** - Expo credentials not configured
4. **No deep linking** - Can't handle invite links or call notifications
5. **No UI library** - Using default React Native components

---

## 📊 Completion Status

### Backend: ~85% Complete
- ✅ Core API routes
- ✅ Twilio integrations (Verify + Video)
- ✅ Push notifications (FCM + APNs)
- ✅ Scheduler with randomization
- ✅ Call lifecycle management
- ✅ Invite system
- ⏳ Database migrations pending
- ⏳ Input validation partial
- ⏳ Production hardening needed

### Mobile: ~15% Complete
- ✅ Authentication flow
- ✅ Dependencies installed
- ⏳ Navigation needed
- ⏳ All screens needed
- ⏳ Video calls needed
- ⏳ Push notifications needed

---

## 🚀 Next Steps (Priority Order)

1. **Set up PostgreSQL and run migrations** - Backend needs working database
2. **Build mobile navigation structure** - Foundation for all screens
3. **Implement group creation/list screens** - Core user journey
4. **Research Twilio Video alternatives** - Critical for call functionality
5. **Implement push notification handlers** - Required for randomized calls
6. **Build call screen** - Main feature
7. **Add offline caching** - Better UX
8. **Polish UI and error handling** - Production ready

---

## 📝 Notes

- All backend services gracefully degrade when credentials not configured
- Scheduler randomization logic is timezone-aware
- Invite codes are 8 characters, case-insensitive, expire in 7 days
- Call participants are tracked (join/leave times)
- Push notifications include custom data for deep linking
- Database schema supports all PRD requirements

---

Last Updated: 2025-11-15
