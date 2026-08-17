# Orbit - Product Requirements Document (PRD)

**Version:** 1.0
**Last Updated:** March 6, 2025
**Status:** Beta Development

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [Technical Architecture](#3-technical-architecture)
4. [Database Schema](#4-database-schema)
5. [API Endpoints](#5-api-endpoints)
6. [Mobile Application](#6-mobile-application)
7. [Backend Services](#7-backend-services)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [Video Call System](#9-video-call-system)
10. [Push Notifications](#10-push-notifications)
11. [Scheduler Service](#11-scheduler-service)
12. [User Flows](#12-user-flows)
13. [Security](#13-security)
14. [Development Status](#14-development-status)
15. [Deployment](#15-deployment)
16. [Future Roadmap](#16-future-roadmap)

---

## 1. Executive Summary

### 1.1 Product Overview

**Orbit** is a mobile-first group video calling application that helps friends and family stay connected through both scheduled and spontaneous video calls. The app features randomized call scheduling to reduce coordination overhead while maintaining regular connection touchpoints.

### 1.2 Core Value Proposition

- **Effortless Scheduling**: Automatic randomized call times based on group preferences (daily or weekly)
- **Spontaneous Connections**: Members can initiate immediate calls at any time
- **Dual Call System**:
  - Scheduled calls with fixed durations that auto-close
  - Spontaneous calls that stay open until all participants leave
- **Smart Preemption**: Scheduled calls automatically take priority over spontaneous calls
- **Zero Friction**: Phone-based authentication, simple invite codes, push notifications

### 1.3 Technology Stack

| Layer | Technology |
|-------|-----------|
| **Mobile** | React Native (Expo), TypeScript |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL (Supabase), Prisma ORM |
| **Video** | Daily.co WebRTC platform |
| **Auth** | Twilio Verify (SMS OTP), JWT |
| **Notifications** | Firebase Cloud Messaging (Android), APNs (iOS) |
| **Architecture** | Monorepo (apps/server, apps/mobile, packages/shared) |

---

## 2. Product Vision

### 2.1 Target Users

- **Primary**: Friend groups, families, remote teams wanting to stay connected
- **Secondary**: Long-distance relationships, study groups, hobby communities
- **Age Range**: 18-65+
- **Technical Proficiency**: Low to medium (designed for non-technical users)

### 2.2 Problem Statement

Modern video calling requires constant coordination:
- Scheduling calls via text messages creates friction
- People forget to initiate calls
- Time zone differences complicate planning
- Spontaneous calls feel intrusive without context

### 2.3 Solution

Orbit automates scheduling while preserving spontaneity:
- System picks random times within preferred cadence (daily/weekly)
- Push notifications alert all members when calls start
- Members can also start immediate calls anytime
- Scheduled calls have clear start/end times
- Spontaneous calls stay open until everyone leaves

### 2.4 Success Metrics

- **Engagement**: Average calls per group per week
- **Retention**: Weekly active users (WAU), Monthly active users (MAU)
- **Completion**: Percentage of scheduled calls with ≥2 participants
- **Adoption**: Average time from signup to first call
- **Quality**: Average call duration, participant count

---

## 3. Technical Architecture

### 3.1 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Mobile Apps (iOS/Android)               │
│              React Native + Expo + Daily.co SDK             │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTPS REST API
                  │ WebSocket (Daily.co video)
┌─────────────────▼───────────────────────────────────────────┐
│                     Backend Server (Node.js)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Express API │  │  Scheduler   │  │  Services    │     │
│  │   Routes     │  │   Worker     │  │  (Video,     │     │
│  │              │  │              │  │   Notify,    │     │
│  │              │  │              │  │   Auth)      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐
│   PostgreSQL    │  │  Daily.co    │  │  Twilio Verify   │
│   (Supabase)    │  │   Video      │  │   FCM / APNs     │
│   Database      │  │   Rooms      │  │   SMS            │
└─────────────────┘  └──────────────┘  └──────────────────┘
```

### 3.2 Repository Structure

```
orbit/
├── apps/
│   ├── server/              # Backend Node.js server
│   │   ├── src/
│   │   │   ├── routes/      # API endpoints
│   │   │   ├── services/    # Business logic
│   │   │   ├── worker/      # Background jobs
│   │   │   ├── util/        # Helpers
│   │   │   └── db/          # Prisma client
│   │   ├── prisma/          # Database schema & migrations
│   │   └── package.json
│   └── mobile/              # React Native mobile app
│       ├── src/
│       │   ├── screens/     # UI screens
│       │   ├── navigation/  # Navigation config
│       │   ├── context/     # State management
│       │   └── utils/       # Helpers
│       ├── App.tsx
│       └── package.json
├── packages/
│   └── shared/              # Shared types/utilities
└── package.json             # Root workspace config
```

### 3.3 Data Flow

**Authentication Flow:**
```
Mobile → POST /auth/request-otp → Twilio Verify → SMS
Mobile → POST /auth/verify-otp → JWT tokens → SecureStore
Mobile → API requests with Bearer token
```

**Scheduled Call Flow:**
```
Scheduler (cron) → Generate random times → Save to DB
Scheduler (1min) → Check due calls → Activate call
Scheduler → Create Daily.co room → Send push notifications
Mobile → Receive push → Join call → Get meeting token
```

**Spontaneous Call Flow:**
```
Mobile → POST /groups/:id/call-now → Create room
Backend → Send push notifications → All members alerted
Mobile → Join call → Get meeting token → Connect to Daily.co
```

---

## 4. Database Schema

### 4.1 Entity Relationship Diagram

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│    User     │◄──┐   │ GroupMember  │   ┌──►│    Group    │
├─────────────┤   │   ├──────────────┤   │   ├─────────────┤
│ id (PK)     │   └───┤ user_id (FK) │   │   │ id (PK)     │
│ phone       │       │ group_id(FK) ├───┘   │ name        │
│ username    │       │ role         │       │ owner_id    │
│ time_zone   │       │ joined_at    │       │ cadence     │
│ created_at  │       └──────────────┘       │ weekly_freq │
└─────────────┘                              │ duration    │
      │                                      └─────────────┘
      │                                             │
      │         ┌──────────────┐                   │
      │         │ CallSession  │◄──────────────────┘
      │         ├──────────────┤
      │         │ id (PK)      │
      │         │ group_id(FK) │
      │         │ status       │
      │         │ call_type    │
      │         │ scheduled_at │
      │         │ started_at   │
      │         │ ends_at      │
      │         │ room_name    │
      │         │ room_url     │
      │         └──────────────┘
      │                │
      │                │
      │         ┌──────▼────────────┐
      └────────►│ CallParticipant   │
                ├───────────────────┤
                │ id (PK)           │
                │ call_id (FK)      │
                │ user_id (FK)      │
                │ joined_at         │
                │ left_at           │
                └───────────────────┘

┌─────────────┐       ┌──────────────┐
│ PushDevice  │       │   Invite     │
├─────────────┤       ├──────────────┤
│ id (PK)     │       │ id (PK)      │
│ user_id(FK) │       │ group_id(FK) │
│ token       │       │ code         │
│ platform    │       │ created_by   │
│ created_at  │       │ expires_at   │
└─────────────┘       │ used_by      │
                      │ used_at      │
                      └──────────────┘
```

### 4.2 Model Definitions

#### User Model
```prisma
model User {
  id         String   @id @default(uuid())
  phone      String   @unique
  username   String   @unique
  time_zone  String   @default("UTC")
  created_at DateTime @default(now()) @db.Timestamptz(6)

  // Relations
  owned_groups        Group[]           @relation("GroupOwner")
  group_memberships   GroupMember[]
  call_participations CallParticipant[]
  devices             PushDevice[]
  created_invites     Invite[]          @relation("InviteCreator")
  used_invites        Invite[]          @relation("InviteUser")

  @@index([phone])
  @@index([username])
}
```

#### Group Model
```prisma
model Group {
  id                    String   @id @default(uuid())
  name                  String
  owner_id              String
  cadence               Cadence  // 'daily' | 'weekly'
  weekly_frequency      Int?     // 1-7 for weekly cadence
  call_duration_minutes Int      @default(30) // 5-120
  created_at            DateTime @default(now()) @db.Timestamptz(6)

  // Relations
  owner    User          @relation("GroupOwner", fields: [owner_id], references: [id])
  members  GroupMember[]
  calls    CallSession[]
  invites  Invite[]

  @@index([owner_id])
}
```

#### CallSession Model
```prisma
model CallSession {
  id           String     @id @default(uuid())
  group_id     String
  status       CallStatus // 'scheduled' | 'active' | 'ended'
  call_type    CallType   @default(spontaneous) // 'spontaneous' | 'scheduled'
  scheduled_at DateTime?  @db.Timestamptz(6)
  started_at   DateTime?  @db.Timestamptz(6)
  ends_at      DateTime?  @db.Timestamptz(6) // null for spontaneous
  ended_at     DateTime?  @db.Timestamptz(6)
  room_name    String?
  room_url     String?

  // Relations
  group        Group             @relation(fields: [group_id], references: [id], onDelete: Cascade)
  participants CallParticipant[]

  @@index([group_id])
  @@index([status])
  @@index([call_type])
  @@index([scheduled_at])
}
```

### 4.3 Enums

```prisma
enum Cadence {
  daily
  weekly
}

enum CallStatus {
  scheduled  // Not yet started
  active     // Currently in progress
  ended      // Completed
}

enum CallType {
  spontaneous  // User-initiated, no fixed end time
  scheduled    // System-generated, fixed duration
}

enum GroupMemberRole {
  owner   // Can modify group settings, generate invites
  member  // Can participate in calls, leave group
}
```

---

## 5. API Endpoints

### 5.1 Authentication Endpoints

#### POST /auth/request-otp
Request OTP code via SMS for phone verification.

**Request:**
```json
{
  "phone": "+14155551234",
  "username": "alice"  // Optional for existing users
}
```

**Response:**
```json
{
  "status": "sent"
}
```

**Logic:**
- Validates phone number format (E.164)
- Uses Twilio Verify to send SMS
- Dev mode: logs code to console

---

#### POST /auth/verify-otp
Verify OTP code and authenticate user.

**Request:**
```json
{
  "phone": "+14155551234",
  "code": "123456",
  "username": "alice"  // Required for new users
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "phone": "+14155551234",
    "username": "alice",
    "time_zone": "UTC",
    "created_at": "2025-03-06T12:00:00Z"
  },
  "access_token": "eyJhbGc...",
  "expires_in": 900,
  "refresh_token": "eyJhbGc..."
}
```

**Logic:**
- Validates OTP with Twilio Verify (dev mode: accepts any 6-digit code)
- Creates or updates user (upsert)
- Issues JWT access token (15 min) and refresh token (30 days)

---

#### POST /auth/refresh
Refresh access token using refresh token.

**Request:**
```json
{
  "refresh_token": "eyJhbGc..."
}
```

**Response:**
```json
{
  "access_token": "eyJhbGc...",
  "expires_in": 900,
  "refresh_token": "eyJhbGc..."  // New refresh token
}
```

---

### 5.2 User Profile Endpoints

#### GET /me
Get current user profile.

**Auth:** Required (JWT Bearer token)

**Response:**
```json
{
  "id": "uuid",
  "phone": "+14155551234",
  "username": "alice",
  "time_zone": "America/Los_Angeles",
  "created_at": "2025-03-06T12:00:00Z"
}
```

---

#### PATCH /me
Update user profile.

**Auth:** Required

**Request:**
```json
{
  "username": "alice_updated",
  "time_zone": "America/New_York"
}
```

**Response:** Updated user object

---

#### POST /me/devices/register-push
Register device for push notifications.

**Auth:** Required

**Request:**
```json
{
  "token": "ExponentPushToken[xxxxx]",
  "platform": "ios"  // or "android"
}
```

**Response:**
```json
{
  "status": "registered"
}
```

**Logic:** Upserts device token (updates if token exists)

---

### 5.3 Group Endpoints

#### POST /groups
Create a new group.

**Auth:** Required

**Request:**
```json
{
  "name": "Family Chat",
  "cadence": "weekly",
  "weekly_frequency": 3,
  "call_duration_minutes": 30
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Family Chat",
  "owner_id": "uuid",
  "cadence": "weekly",
  "weekly_frequency": 3,
  "call_duration_minutes": 30,
  "member_count": 1,
  "members": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "username": "alice",
      "role": "owner",
      "joined_at": "2025-03-06T12:00:00Z"
    }
  ],
  "created_at": "2025-03-06T12:00:00Z"
}
```

**Validation:**
- `name`: 1-100 characters
- `cadence`: 'daily' or 'weekly'
- `weekly_frequency`: 1-7 (required if weekly)
- `call_duration_minutes`: 5-120

---

#### GET /groups
List all groups user is a member of.

**Auth:** Required

**Response:**
```json
{
  "groups": [
    {
      "id": "uuid",
      "name": "Family Chat",
      "cadence": "weekly",
      "weekly_frequency": 3,
      "call_duration_minutes": 30,
      "member_count": 5,
      "role": "owner"
    }
  ]
}
```

---

#### GET /groups/:id
Get detailed group information.

**Auth:** Required (must be member)

**Response:**
```json
{
  "id": "uuid",
  "name": "Family Chat",
  "owner_id": "uuid",
  "cadence": "weekly",
  "weekly_frequency": 3,
  "call_duration_minutes": 30,
  "member_count": 5,
  "members": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "username": "alice",
      "role": "owner",
      "joined_at": "2025-03-06T12:00:00Z"
    }
  ],
  "last_call": {
    "id": "uuid",
    "started_at": "2025-03-05T15:30:00Z",
    "ended_at": "2025-03-05T16:00:00Z",
    "participant_count": 3
  },
  "created_at": "2025-03-06T12:00:00Z"
}
```

---

#### PATCH /groups/:id
Update group settings (owner only).

**Auth:** Required (owner)

**Request:**
```json
{
  "name": "Updated Name",
  "cadence": "daily",
  "call_duration_minutes": 45
}
```

**Response:** Updated group object

---

#### DELETE /groups/:id
Delete group (owner only).

**Auth:** Required (owner)

**Response:** 204 No Content

**Logic:** Cascades to delete all members, calls, participants, invites

---

#### POST /groups/:id/invite
Generate invite code (owner only).

**Auth:** Required (owner)

**Response:**
```json
{
  "invite_code": "ABC12345",
  "expires_at": "2025-03-13T12:00:00Z",
  "invite_link": "orbit://invite/ABC12345"
}
```

**Logic:**
- Generates unique 8-character alphanumeric code (uppercase)
- Expires in 7 days
- Can be used once

---

#### POST /groups/:id/join
Join group using invite code.

**Auth:** Required

**Request:**
```json
{
  "invite_code": "ABC12345"
}
```

**Response:**
```json
{
  "status": "joined"  // or "already_member"
}
```

**Validation:**
- Code exists
- Code not expired
- Code not already used by another user
- User not already a member

---

#### GET /groups/invites/:code/info
Get group info from invite code (for preview before joining).

**Auth:** Required

**Response:**
```json
{
  "group_id": "uuid",
  "group_name": "Family Chat",
  "code": "ABC12345",
  "expires_at": "2025-03-13T12:00:00Z"
}
```

---

#### POST /groups/:id/leave
Leave group.

**Auth:** Required (member, not owner)

**Response:**
```json
{
  "status": "left"
}
```

**Logic:** Owner cannot leave (must delete group or transfer ownership)

---

### 5.4 Call Endpoints

#### POST /groups/:id/call-now
Start immediate spontaneous call.

**Auth:** Required (member)

**Response:**
```json
{
  "id": "uuid",
  "group_id": "uuid",
  "status": "active",
  "call_type": "spontaneous",
  "started_at": "2025-03-06T15:30:00Z",
  "ends_at": null,
  "participant_count": 0,
  "room_name": "uuid_2025-03-06T15-30-00-000Z"
}
```

**Logic:**
- Checks no active call exists
- Blocks if scheduled call is active
- Creates Daily.co room (no expiry)
- Creates call session with `call_type: 'spontaneous'`, `ends_at: null`
- Sends push notifications to all group members

---

#### GET /groups/:id/calls/current
Get currently active call for group.

**Auth:** Required (member)

**Response:**
```json
{
  "current": {
    "id": "uuid",
    "group_id": "uuid",
    "status": "active",
    "call_type": "scheduled",
    "started_at": "2025-03-06T15:30:00Z",
    "ends_at": "2025-03-06T16:00:00Z",
    "room_name": "uuid_2025-03-06T15-30-00-000Z",
    "participant_count": 3,
    "participants": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "username": "alice",
        "joined_at": "2025-03-06T15:31:00Z"
      }
    ]
  }
}
```

---

#### GET /groups/:id/calls/history
Get past calls for group (last 50).

**Auth:** Required (member)

**Response:**
```json
{
  "calls": [
    {
      "id": "uuid",
      "group_id": "uuid",
      "status": "ended",
      "call_type": "scheduled",
      "started_at": "2025-03-05T15:30:00Z",
      "ended_at": "2025-03-05T16:00:00Z",
      "duration_minutes": 30,
      "participant_count": 4
    }
  ]
}
```

---

#### POST /groups/:id/calls/:callId/join-token
Get meeting token to join call.

**Auth:** Required (member)

**Response:**
```json
{
  "token": "eyJhbGc...",
  "room_name": "uuid_2025-03-06T15-30-00-000Z",
  "room_url": "https://orbit-calls.daily.co/uuid_2025-03-06T15-30-00-000Z",
  "ends_at": "2025-03-06T16:00:00Z"  // or null for spontaneous
}
```

**Logic:**
- Validates call is active
- Creates Daily.co meeting token
- Records participant joining in CallParticipant table

---

#### POST /groups/:id/calls/:callId/leave
Record participant leaving call.

**Auth:** Required (member)

**Response:**
```json
{
  "success": true
}
```

**Logic:**
- Records `left_at` timestamp for participant
- **For spontaneous calls:** If all participants have left, closes call and deletes Daily.co room
- **For scheduled calls:** Keeps call open until `ends_at` time

---

## 6. Mobile Application

### 6.1 Screen Architecture

```
AuthScreen                         (Unauthenticated stack)
    │
    └─► TabNavigator               (Authenticated stack)
            ├─► HomeScreen         (Groups list)
            └─► SettingsScreen     (Profile settings)

GroupDetailScreen                  (Modal stack)
    └─► CallScreen                 (Full-screen modal)

CreateGroupScreen                  (Modal stack)
```

### 6.2 Screen Descriptions

#### AuthScreen
**Purpose:** Phone authentication with OTP

**Features:**
- Two-step flow:
  1. Phone number input → Send OTP
  2. OTP verification + username → Login
- Phone number format: +1 (XXX) XXX-XXXX
- OTP: 6-digit code
- Username: Alphanumeric, shown if new user
- Development mode: accepts any 6-digit code
- Keyboard types: phone-pad for phone, numeric for OTP
- Token storage in SecureStore (encrypted)

**User Flow:**
1. Enter phone number
2. Tap "Send Code"
3. Receive SMS (or check dev console)
4. Enter 6-digit OTP
5. Enter username (new users only)
6. Tap "Verify"
7. Tokens stored → Navigate to Home

---

#### HomeScreen
**Purpose:** Groups list and primary navigation

**Features:**
- Scrollable list of user's groups
- Pull-to-refresh
- Empty state: "No groups yet. Create one to get started!"
- Group cards display:
  - Group name
  - Cadence badge (Daily or "3x/week")
  - Member count
- Floating Action Button (FAB, bottom-right): Create group
- "Join with Code" button (green, bottom-left)
- Tap group card → Navigate to GroupDetailScreen

**Join with Code Flow:**
1. Tap "Join with Code"
2. Alert prompt for 8-character code
3. Enter code (uppercase alphanumeric)
4. Backend validates and adds to group
5. Group list refreshes
6. Success/error toast

---

#### CreateGroupScreen
**Purpose:** Create new group

**Features:**
- Form fields:
  - Group name (text input)
  - Cadence selector (Daily / Weekly radio buttons)
  - Weekly frequency (if weekly selected, 1-7)
  - Call duration (minutes, 5-120)
- "Create Group" button
- Form validation with error messages
- Loading state during creation
- Auto-navigate to GroupDetailScreen on success

**Default Values:**
- Cadence: Daily
- Weekly frequency: 2
- Duration: 30

---

#### GroupDetailScreen
**Purpose:** Group management and call actions

**Features:**
- Header section:
  - Group name (large, bold)
  - Cadence info ("Daily calls" or "3 calls per week")
  - Duration info ("30 minute calls")
- Active call banner (if call in progress):
  - Green background
  - "Call in progress" text
  - "Join Call" button → Navigate to CallScreen
- Action buttons:
  - "Start Call Now" (blue, prominent)
  - "Invite Members" (green, owner only)
- Members section:
  - List of all members
  - Username displayed
  - "Owner" badge for group owner
  - Member count in header

**Invite Flow:**
1. Tap "Invite Members" (owner only)
2. Backend generates 8-char code
3. Code copied to clipboard
4. Alert shows code with "Share" option
5. Native share dialog opens (SMS, WhatsApp, etc.)

**Start Call Flow:**
1. Tap "Start Call Now"
2. POST /groups/:id/call-now
3. Backend creates room + sends push notifications
4. Get meeting token
5. Navigate to CallScreen with token

**Join Call Flow:**
1. Tap "Join Call" (if call active)
2. POST /groups/:id/calls/:callId/join-token
3. Get meeting token
4. Navigate to CallScreen with token

---

#### CallScreen
**Purpose:** Video call interface using Daily.co

**Features:**
- Full-screen video layout
- Remote participants:
  - Grid layout (up to 10 participants)
  - Video tracks rendered with DailyMediaView
  - Audio tracks enabled
  - Fills main screen area
- Local video (self-view):
  - Small overlay (top-right corner)
  - Mirrored video
  - 120x160 pixels
  - White border, rounded corners
  - Z-index: 10 (above remote videos)
- Waiting state:
  - "Waiting for others to join..." text
  - Shown when no remote participants
- Control bar (bottom):
  - Microphone toggle (🎤 / 🔇)
  - "End Call" button (red, center, prominent)
  - Video toggle (📹 / 🚫)
  - Semi-transparent background
- Real-time events:
  - Participant joined/left
  - Video/audio toggled
  - Error handling

**Technical Details:**
- SDK: @daily-co/react-native-daily-js
- Daily.createCallObject() for call management
- DailyMediaView for video rendering
- Event listeners:
  - `joined-meeting`: Initialize participants
  - `participant-joined`: Add to state
  - `participant-updated`: Update video/audio state
  - `participant-left`: Remove from state
  - `left-meeting`: Clean up and navigate back
  - `error`: Log and show error
- Automatic cleanup on unmount
- Notifies backend on leave (POST /leave)

**User Flow:**
1. Camera/mic permissions requested (first time)
2. Connect to Daily.co room with token
3. Video interface loads
4. See other participants join/leave
5. Toggle audio/video as needed
6. Tap "End Call"
7. Backend records leave time
8. Return to GroupDetailScreen

---

#### SettingsScreen
**Purpose:** User profile and app settings

**Features:**
- Profile section:
  - Username (editable in future)
  - Phone number (read-only)
  - Timezone (editable in future)
- About section:
  - App name: "Orbit"
  - Version number (from package.json)
- Actions:
  - "Logout" button (red, destructive style)
  - Confirmation dialog before logout
- Logout process:
  - Clears tokens from SecureStore
  - Unregisters push token
  - Navigates to AuthScreen

---

### 6.3 Navigation Structure

```typescript
// Root Navigator (Stack)
const RootNavigator = () => {
  const { user } = useAuth();

  return (
    <Stack.Navigator>
      {!user ? (
        <Stack.Screen name="Auth" component={AuthScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={TabNavigator} />
          <Stack.Screen name="GroupDetail" component={GroupDetailScreen} options={{ presentation: 'modal' }} />
          <Stack.Screen name="CreateGroup" component={CreateGroupScreen} options={{ presentation: 'modal' }} />
          <Stack.Screen name="Call" component={CallScreen} options={{ presentation: 'fullScreenModal' }} />
        </>
      )}
    </Stack.Navigator>
  );
};

// Tab Navigator (Bottom Tabs)
const TabNavigator = () => (
  <Tab.Navigator>
    <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: 'home' }} />
    <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: 'settings' }} />
  </Tab.Navigator>
);
```

### 6.4 State Management

**AuthContext:**
```typescript
interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (phone: string, code: string, username?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string>;
  isLoading: boolean;
}
```

**Usage:**
- Wraps entire app in `<AuthProvider>`
- Provides authentication state globally
- Handles token refresh automatically
- Persists tokens in SecureStore

---

### 6.5 API Client

**Features:**
- Axios-based HTTP client
- Automatic Bearer token injection
- 401 response interceptor
- Automatic token refresh on 401
- Retry original request with new token
- Logout on refresh failure

**Configuration:**
```typescript
const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Add Bearer token
client.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: Refresh token on 401
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const newToken = await refreshAccessToken();
      error.config.headers.Authorization = `Bearer ${newToken}`;
      return axios.request(error.config);
    }
    return Promise.reject(error);
  }
);
```

---

## 7. Backend Services

### 7.1 Twilio Verify Service

**File:** `/apps/server/src/services/twilioVerify.ts`

**Purpose:** Phone number verification via SMS OTP

**Functions:**

**`requestOtp(phone: string)`**
- Sends 6-digit OTP via SMS
- Uses Twilio Verify API
- Dev mode: logs code to console, always returns success
- Returns: `{ status: 'sent' }`

**`verifyOtp(phone: string, code: string)`**
- Validates OTP code
- Uses Twilio Verify API
- Dev mode: accepts any 6-digit code
- Returns: `{ valid: boolean }`

**Configuration:**
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Development Mode:**
- If credentials not set, service runs in dev mode
- Logs OTP to console: `[OTP] Code for +14155551234: 123456`
- Always returns success for request
- Always accepts any 6-digit code for verify

---

### 7.2 Daily.co Video Service

**File:** `/apps/server/src/services/dailyVideo.ts`

**Purpose:** Daily.co room and token management

**Functions:**

**`createRoom(roomName: string, expiresAt?: Date)`**
- Creates private Daily.co video room
- Returns room URL
- Room properties:
  - `name`: roomName
  - `privacy`: 'private' (requires token)
  - `properties.max_participants`: 10
  - `properties.enable_screenshare`: true
  - `properties.enable_chat`: false
  - `properties.enable_knocking`: false
  - `properties.enable_prejoin_ui`: false
  - `properties.exp`: expiresAt timestamp (optional)

**`createMeetingToken(roomName: string, userId: string, expiresAt?: Date)`**
- Generates meeting token for user to join room
- Token properties:
  - `room_name`: roomName
  - `user_name`: userId
  - `enable_screenshare`: true
  - `start_video_off`: false
  - `start_audio_off`: false
  - `exp`: expiresAt timestamp (optional)
- Returns: token string

**`deleteRoom(roomName: string)`**
- Deletes Daily.co room
- Used when spontaneous call ends

**Configuration:**
```bash
DAILY_API_KEY=your_daily_api_key
DAILY_DOMAIN=orbit-calls.daily.co
```

**Development Mode:**
- If credentials not set, returns stub URLs and tokens
- Room URL: `https://daily.co/stub-room-{roomName}`
- Token: `stub-token-{userId}`

---

### 7.3 Notifications Service

**File:** `/apps/server/src/services/notifications.ts`

**Purpose:** Multi-platform push notifications

**Functions:**

**`sendPushTokens(tokens: PushToken[], title: string, body: string, data: object)`**
- Sends push notifications to multiple devices
- Groups tokens by platform (iOS/Android)
- Routes to appropriate service (FCM/APNs)
- Returns success/failure counts

**`sendApns(tokens: string[], title: string, body: string, data: object)`**
- iOS push notifications via APNs
- Uses node-apn library
- Configuration:
  - APNS_KEY_ID: Auth Key ID
  - APNS_TEAM_ID: Apple Team ID
  - APNS_KEY_PATH: Path to .p8 key file
  - APNS_BUNDLE_ID: App bundle ID
  - APNS_PRODUCTION: true/false (sandbox vs production)

**`sendFcm(tokens: string[], title: string, body: string, data: object)`**
- Android push notifications via Firebase Cloud Messaging
- Uses firebase-admin SDK
- Configuration:
  - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON

**`sendSms(phones: string[], message: string)`**
- SMS notifications via Twilio
- Fallback for push notification failures
- Uses Twilio Messaging API

**Push Notification Payload:**
```json
{
  "notification": {
    "title": "Family Chat is calling!",
    "body": "Tap to join the scheduled call"
  },
  "data": {
    "type": "call_started",
    "callId": "uuid",
    "groupId": "uuid"
  }
}
```

**Development Mode:**
- Logs to console if credentials not configured
- Returns mock success counts

---

### 7.4 Scheduler Service

**File:** `/apps/server/src/services/scheduler.ts`

**Purpose:** Automatic call generation and lifecycle management

**Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│              Scheduler Service (1 hour)                 │
│         generateScheduledCalls()                        │
│   ┌───────────────────────────────────────────────┐    │
│   │ For each group:                                │    │
│   │   Daily: Create 1 call for tomorrow           │    │
│   │   Weekly: Create N calls for next 7 days      │    │
│   │   Random times between 8am-10pm                │    │
│   └───────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│            Scheduler Worker (1 minute)                  │
│              activateDueCalls()                         │
│   ┌───────────────────────────────────────────────┐    │
│   │ Find calls where scheduled_at <= now          │    │
│   │ Create Daily.co room                           │    │
│   │ Send push notifications                        │    │
│   │ Preempt spontaneous calls if active            │    │
│   │ Update status to 'active'                      │    │
│   └───────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│            Scheduler Worker (1 minute)                  │
│            closeExpiredCalls()                          │
│   ┌───────────────────────────────────────────────┐    │
│   │ Find scheduled calls where ends_at <= now     │    │
│   │ Update status to 'ended'                       │    │
│   │ Record ended_at timestamp                      │    │
│   │ (Spontaneous calls close when all leave)      │    │
│   └───────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Functions:**

**`generateScheduledCalls()`**
- Runs: Every 1 hour
- Purpose: Generate future scheduled calls

**Logic:**
1. Fetch all groups from database
2. For each group:
   - **Daily cadence:**
     - Check if call exists for tomorrow
     - If not, generate 1 random time (8am-10pm tomorrow)
     - Create CallSession with `status: 'scheduled'`, `call_type: 'scheduled'`
   - **Weekly cadence:**
     - Check how many calls exist for next 7 days
     - Generate (weekly_frequency - existing) calls
     - Spread across random days (max 1 per day)
     - Random times between 8am-10pm

**`activateDueCalls()`**
- Runs: Every 1 minute
- Purpose: Start scheduled calls at their designated time

**Logic:**
1. Find CallSessions where:
   - `status = 'scheduled'`
   - `scheduled_at >= (now - 1 minute)` and `<= now`
2. For each call:
   - Check for active spontaneous calls
   - If spontaneous call exists:
     - Close spontaneous call
     - Delete Daily.co room
     - Log preemption
   - Create Daily.co room with expiry = ends_at
   - Update call: `status = 'active'`, `started_at = now`, `room_url = url`
   - Fetch group members with devices
   - Send push notifications to all members
   - Log activation

**`closeExpiredCalls()`**
- Runs: Every 1 minute
- Purpose: Close scheduled calls that have exceeded duration

**Logic:**
1. Find CallSessions where:
   - `status = 'active'`
   - `call_type = 'scheduled'` (NOT spontaneous)
   - `ends_at <= now`
2. For each call:
   - Update call: `status = 'ended'`, `ended_at = now`
   - Log closure
3. Note: Spontaneous calls are closed via `/leave` endpoint when all participants leave

**`getRandomTime(start: Date, end: Date)`**
- Returns random timestamp between start and end dates

**`getRandomTimesForWeek(startOfWeek: Date, count: number)`**
- Generates N random times across 7 days
- Ensures no two calls on same day
- Random times between 8am-10pm each day
- Returns sorted array of dates

**`createScheduledCall(groupId: string, scheduledAt: Date)`**
- Creates CallSession record
- Sets `call_type = 'scheduled'`
- Calculates `ends_at = scheduledAt + duration`
- Generates room name: `{groupId}_{timestamp}`

---

### 7.5 Scheduler Worker

**File:** `/apps/server/src/worker/scheduler.ts`

**Purpose:** Background job runner for scheduler

**Intervals:**
```typescript
// Generate scheduled calls: every 1 hour
setInterval(scheduler.generateScheduledCalls, 60 * 60 * 1000);

// Activate due calls: every 1 minute
setInterval(scheduler.activateDueCalls, 60 * 1000);

// Close expired calls: every 1 minute
setInterval(scheduler.closeExpiredCalls, 60 * 1000);
```

**Startup:**
- Runs immediately on server start
- Calls all functions once on startup
- Then runs on intervals

**Configuration:**
```bash
SCHEDULER_ENABLED=true  # Set to false to disable
```

**Limitations:**
- In-memory intervals (not durable)
- Lost on server restart
- No retry mechanism
- Single-process only

**Future Improvements:**
- Durable job queue (Bull/BullMQ with Redis)
- Distributed locking for multi-process
- Retry logic with exponential backoff
- Dead letter queue for failed jobs

---

### 7.6 JWT Service

**File:** `/apps/server/src/services/jwt.ts`

**Purpose:** JWT token generation and validation

**Function:**

**`issueAccessAndRefreshTokens({ userId: string })`**
- Generates JWT token pair
- Access token:
  - Payload: `{ sub: userId }`
  - Secret: JWT_SECRET
  - Expiry: 15 minutes (JWT_EXPIRES_IN)
- Refresh token:
  - Payload: `{ type: 'refresh', sub: userId }`
  - Secret: REFRESH_TOKEN_SECRET
  - Expiry: 30 days (REFRESH_TOKEN_EXPIRES_IN)
- Returns: `{ access_token, expires_in, refresh_token }`

**Configuration:**
```bash
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=900  # 15 minutes in seconds
REFRESH_TOKEN_SECRET=your-refresh-secret
REFRESH_TOKEN_EXPIRES_IN=2592000  # 30 days in seconds
```

**Middleware:**

**`requireJwt(req, res, next)`**
- Validates JWT from Authorization header
- Format: `Bearer {token}`
- Verifies signature and expiration
- Decodes userId from `sub` claim
- Attaches `req.userId` for route handlers
- Returns 401 if invalid/expired

---

## 8. Authentication & Authorization

### 8.1 Authentication Flow

```
┌──────────────┐
│ User enters  │
│ phone number │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────┐
│ POST /auth/request-otp           │
│ Backend sends SMS via Twilio     │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────┐
│ User enters  │
│ 6-digit OTP  │
│ + username   │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────┐
│ POST /auth/verify-otp            │
│ Backend validates with Twilio    │
│ Creates/updates user (upsert)    │
│ Issues JWT access + refresh      │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ Mobile stores tokens in          │
│ SecureStore (encrypted)          │
│ Navigates to authenticated app   │
└──────────────────────────────────┘
```

### 8.2 Token Management

**Access Token:**
- **Type:** JWT
- **Lifetime:** 15 minutes (configurable)
- **Storage:** Expo SecureStore (encrypted)
- **Usage:** Bearer token in Authorization header
- **Payload:**
  ```json
  {
    "sub": "user_uuid",
    "iat": 1709740800,
    "exp": 1709741700
  }
  ```

**Refresh Token:**
- **Type:** JWT
- **Lifetime:** 30 days (configurable)
- **Storage:** Expo SecureStore (encrypted)
- **Usage:** POST /auth/refresh endpoint
- **Payload:**
  ```json
  {
    "type": "refresh",
    "sub": "user_uuid",
    "iat": 1709740800,
    "exp": 1712332800
  }
  ```

**Token Refresh Flow:**
```
┌──────────────────────────────────┐
│ API request returns 401          │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ Interceptor catches 401          │
│ Retrieves refresh token          │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ POST /auth/refresh               │
│ Backend validates refresh token  │
│ Issues new token pair            │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ Store new tokens                 │
│ Retry original request           │
└──────────────────────────────────┘
```

### 8.3 Authorization Levels

**Public Endpoints:** (No authentication required)
- `POST /auth/request-otp`
- `POST /auth/verify-otp`
- `GET /health`

**Authenticated Endpoints:** (Valid JWT required)
- All `/me/*` endpoints
- All `/groups/*` endpoints
- All call endpoints

**Ownership Authorization:**

| Action | Owner | Member |
|--------|-------|--------|
| View group details | ✅ | ✅ |
| Start call | ✅ | ✅ |
| Join call | ✅ | ✅ |
| Leave group | ❌ | ✅ |
| Update group settings | ✅ | ❌ |
| Delete group | ✅ | ❌ |
| Generate invite code | ✅ | ❌ |

**Membership Validation:**
- All group and call endpoints verify user is a member
- Query: `SELECT * FROM GroupMember WHERE group_id = ? AND user_id = ?`
- Returns 403 Forbidden if not a member

---

## 9. Video Call System

### 9.1 Two-Track Call System

Orbit implements two distinct types of calls with different behaviors:

#### Spontaneous Calls ("Call Now")
**Initiated by:** Any group member via "Start Call Now" button

**Characteristics:**
- No pre-scheduled time
- No fixed end time (`ends_at = null`)
- Stays open indefinitely
- Closes only when ALL participants leave
- Can be preempted by scheduled calls
- Blocked if scheduled call is active

**Use Cases:**
- Impromptu catch-ups
- Emergency discussions
- Flexible hangouts

**Lifecycle:**
```
User taps "Start Call Now"
  → POST /groups/:id/call-now
  → Check no active call exists
  → Block if scheduled call active
  → Create Daily.co room (no expiry)
  → Create CallSession (call_type: spontaneous, ends_at: null)
  → Send push notifications
  → Status: active

Participants join/leave freely
  → POST /join-token (records participant)
  → POST /leave (records left_at)

All participants leave
  → Check participants.length === 0
  → Update CallSession (status: ended)
  → Delete Daily.co room
```

#### Scheduled Calls
**Initiated by:** Scheduler service at random times

**Characteristics:**
- Pre-scheduled by system
- Fixed duration (group setting: 5-120 minutes)
- Auto-closes when duration expires
- Takes priority over spontaneous calls
- Cannot be interrupted by spontaneous calls

**Use Cases:**
- Regular check-ins
- Planned family/friend calls
- Consistent connection times

**Lifecycle:**
```
Scheduler generates calls (1 hour interval)
  → For daily: 1 call tomorrow (random 8am-10pm)
  → For weekly: N calls next 7 days (random, 1/day)
  → Create CallSession (status: scheduled, call_type: scheduled)

Scheduler activates calls (1 minute interval)
  → Find calls where scheduled_at <= now
  → Check for active spontaneous calls
  → If found: close spontaneous call, delete room
  → Create Daily.co room (with expiry)
  → Update CallSession (status: active, started_at, room_url)
  → Send push notifications to all members

Call duration expires
  → Scheduler checks ends_at <= now (1 minute interval)
  → Update CallSession (status: ended, ended_at)
  → Daily.co room auto-expires
```

### 9.2 Call Preemption Rules

**Scenario 1:** Spontaneous call active, scheduled call activates
```
Scheduled call time arrives
  → Scheduler finds active spontaneous call
  → Closes spontaneous call (status: ended)
  → Deletes spontaneous Daily.co room
  → Creates new scheduled call room
  → Notifies all members
  → Scheduled call takes over
```

**Scenario 2:** Scheduled call active, user tries to start spontaneous call
```
User taps "Start Call Now"
  → Backend checks for active calls
  → Finds active scheduled call
  → Returns error: "Cannot start spontaneous call while scheduled call is active"
  → User sees error message
  → Can join existing scheduled call instead
```

**Scenario 3:** Multiple spontaneous call attempts
```
User A starts spontaneous call
  → Call created and active
User B tries to start spontaneous call
  → Backend checks for active calls
  → Finds active spontaneous call
  → Returns error: "A call is already active for this group"
  → User B can join existing call
```

### 9.3 Daily.co Integration

**Why Daily.co?**
- Simpler API than Twilio Video
- Better React Native support
- Official SDK: @daily-co/react-native-daily-js
- REST API for room management
- Meeting tokens for access control
- WebRTC infrastructure included

**Room Configuration:**
```json
{
  "name": "uuid_2025-03-06T15-30-00-000Z",
  "privacy": "private",
  "properties": {
    "max_participants": 10,
    "enable_screenshare": true,
    "enable_chat": false,
    "enable_knocking": false,
    "enable_prejoin_ui": false,
    "exp": 1709744400  // Optional: Unix timestamp
  }
}
```

**Meeting Token Configuration:**
```json
{
  "properties": {
    "room_name": "uuid_2025-03-06T15-30-00-000Z",
    "user_name": "user_uuid",
    "enable_screenshare": true,
    "start_video_off": false,
    "start_audio_off": false,
    "exp": 1709744400  // Optional: Unix timestamp
  }
}
```

**Room Naming Convention:**
- Format: `{groupId}_{timestamp}`
- Invalid characters (`:` and `.`) replaced with `-`
- Example: `abc123_2025-03-06T15-30-00-000Z`

**Room Lifecycle:**

**Spontaneous Calls:**
1. Created when user starts call (no expiry)
2. Stays open indefinitely
3. Deleted via API when all participants leave

**Scheduled Calls:**
1. Created when scheduler activates call
2. Expiry set to `ends_at` timestamp
3. Daily.co auto-closes after expiry
4. Backend also closes via scheduler (redundant safety)

### 9.4 Video Quality & Performance

**Daily.co Default Settings:**
- Adaptive bitrate (based on network conditions)
- Automatic bandwidth optimization
- Network quality monitoring
- Automatic fallback to audio-only (if needed)

**Device Requirements:**
- iOS: 12.0+
- Android: 6.0+ (API level 23)
- Camera and microphone permissions
- 1 Mbps minimum bandwidth (recommended: 3+ Mbps)

**Participant Limits:**
- Max: 10 participants per call
- Optimal: 4-6 participants for best quality
- Grid layout adjusts dynamically

---

## 10. Push Notifications

### 10.1 Notification Architecture

```
┌────────────────────────────────────────────────────────┐
│              Backend Event (Call Started)              │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│         Fetch group members + push devices             │
│   SELECT users, devices FROM group_members             │
└────────────────────┬───────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────┐         ┌───────────────┐
│  iOS Devices  │         │Android Devices│
│    (APNs)     │         │     (FCM)     │
└───────┬───────┘         └───────┬───────┘
        │                         │
        │                         │
        ▼                         ▼
┌───────────────┐         ┌───────────────┐
│ Apple Push    │         │Firebase Cloud │
│ Notification  │         │   Messaging   │
│   Service     │         │               │
└───────┬───────┘         └───────┬───────┘
        │                         │
        └────────────┬────────────┘
                     │
                     ▼
             ┌───────────────┐
             │  User Device  │
             │  (iOS/Android)│
             └───────────────┘
```

### 10.2 Notification Types

**Call Started (call_started)**

**Trigger Events:**
1. Scheduled call activates (scheduler)
2. User starts spontaneous call (call-now endpoint)

**Notification Payload:**
```json
{
  "title": "Family Chat is calling!",
  "body": "Tap to join the scheduled call",  // or "Tap to join the call"
  "data": {
    "type": "call_started",
    "callId": "uuid",
    "groupId": "uuid"
  }
}
```

**User Experience:**
- Push notification appears on lock screen
- Sound/vibration alert
- Tap notification → Open app → Navigate to group
- In-app banner if app is open

### 10.3 Platform-Specific Implementation

#### iOS (APNs)

**Configuration:**
```bash
APNS_KEY_ID=ABC1234567
APNS_TEAM_ID=XYZ9876543
APNS_KEY_PATH=./credentials/AuthKey_ABC1234567.p8
APNS_BUNDLE_ID=com.mylesharris.orbit
APNS_PRODUCTION=false  # true for App Store builds
```

**Payload Format:**
```json
{
  "aps": {
    "alert": {
      "title": "Family Chat is calling!",
      "body": "Tap to join the call"
    },
    "sound": "default",
    "badge": 1
  },
  "data": {
    "type": "call_started",
    "callId": "uuid",
    "groupId": "uuid"
  }
}
```

**Certificate Types:**
- **Sandbox:** For development and TestFlight
- **Production:** For App Store releases
- `.p8` key file required (from Apple Developer Portal)

#### Android (FCM)

**Configuration:**
```bash
GOOGLE_APPLICATION_CREDENTIALS=./credentials/firebase-service-account.json
```

**Payload Format:**
```json
{
  "notification": {
    "title": "Family Chat is calling!",
    "body": "Tap to join the call"
  },
  "data": {
    "type": "call_started",
    "callId": "uuid",
    "groupId": "uuid"
  },
  "android": {
    "priority": "high",
    "notification": {
      "sound": "default",
      "channelId": "call_notifications"
    }
  }
}
```

**Requirements:**
- Firebase project with FCM enabled
- Service account JSON with admin permissions
- Notification channel created in app

### 10.4 Token Registration Flow

```
App starts
  → Request notification permissions
  → Get Expo push token
  → POST /me/devices/register-push
     { token: "ExponentPushToken[xxxxx]", platform: "ios" }
  → Backend stores in PushDevice table (upsert)

Token refresh (Expo handles automatically)
  → New token generated
  → POST /me/devices/register-push (updates existing)

User logs out
  → DELETE /me/devices/register-push?token=xxx
  → Backend removes from PushDevice table
```

### 10.5 Notification Handling in App

**App States:**

**1. Foreground (app open):**
```typescript
Notifications.addNotificationReceivedListener((notification) => {
  // Show in-app banner
  // Update UI (e.g., show "Call in progress" banner)
});
```

**2. Background (app in background):**
```typescript
Notifications.addNotificationResponseReceivedListener((response) => {
  const { callId, groupId } = response.notification.request.content.data;
  // Navigate to GroupDetailScreen with groupId
  // Auto-join call if still active
});
```

**3. Killed (app not running):**
```typescript
// App opens from notification tap
Notifications.getLastNotificationResponseAsync().then((response) => {
  if (response) {
    const { callId, groupId } = response.notification.request.content.data;
    // Navigate to GroupDetailScreen
  }
});
```

### 10.6 Future Notification Enhancements

- **Call reminders:** 5 minutes before scheduled call
- **Missed call notifications:** If user doesn't join
- **Group activity:** New member joined, settings changed
- **Call summaries:** Post-call recap (duration, participants)
- **Rich notifications:** Show participant avatars, preview

---

## 11. Scheduler Service

### 11.1 Architecture Overview

The scheduler is the core automation system that generates and manages scheduled calls.

**Components:**
1. **Generator:** Creates future scheduled calls (hourly)
2. **Activator:** Starts calls at scheduled time (every minute)
3. **Closer:** Ends expired calls (every minute)

### 11.2 Call Generation Logic

**Daily Cadence:**
```
For each group with cadence="daily":
  Tomorrow = today + 1 day at midnight
  End of tomorrow = tomorrow + 1 day

  Check: Does CallSession exist where
    group_id = group.id AND
    status = 'scheduled' AND
    scheduled_at >= tomorrow AND
    scheduled_at < end_of_tomorrow

  If not exists:
    Generate random time between tomorrow 8am and tomorrow 10pm
    Create CallSession:
      group_id = group.id
      status = 'scheduled'
      call_type = 'scheduled'
      scheduled_at = random_time
      ends_at = random_time + call_duration_minutes
      room_name = "{group_id}_{timestamp}"
```

**Weekly Cadence:**
```
For each group with cadence="weekly":
  Start of week = tomorrow at midnight
  End of week = start_of_week + 7 days

  Count existing calls:
    WHERE group_id = group.id
    AND status = 'scheduled'
    AND scheduled_at >= start_of_week
    AND scheduled_at < end_of_week

  Calls to create = weekly_frequency - existing_count

  If calls_to_create > 0:
    Generate N random days (1 per day, no duplicates)
    For each day:
      Random time between 8am-10pm that day

    Create N CallSessions with generated times
```

**Time Distribution:**
```
Random time algorithm:
  start_time = date at 8:00 AM
  end_time = date at 10:00 PM

  random_milliseconds = Math.random() * (end_time - start_time)
  scheduled_at = start_time + random_milliseconds
```

### 11.3 Call Activation Logic

**Trigger:** Every 1 minute, finds calls due to start

```
Query CallSessions:
  WHERE status = 'scheduled'
  AND scheduled_at >= (now - 1 minute)
  AND scheduled_at <= now

For each due call:
  1. Fetch group with members and devices

  2. Check for active spontaneous calls:
     If found:
       - Update spontaneous call: status = 'ended', ended_at = now
       - Delete Daily.co room
       - Log: "Closed spontaneous call {id} to make way for scheduled call"

  3. Create Daily.co room:
     - Name: call.room_name
     - Expiry: call.ends_at
     - Returns: room_url

  4. Update call:
     - status = 'active'
     - started_at = now
     - room_url = room_url

  5. Send push notifications:
     - Extract push tokens from members' devices
     - Group by platform (iOS/Android)
     - Send via FCM/APNs:
       Title: "{group.name} is calling!"
       Body: "Tap to join the scheduled call"
       Data: { type: 'call_started', callId, groupId }

  6. Log: "Activated scheduled call {id} for group {name}"
```

### 11.4 Call Closure Logic

**Trigger:** Every 1 minute, finds expired scheduled calls

```
Query CallSessions:
  WHERE status = 'active'
  AND call_type = 'scheduled'  // IMPORTANT: Only scheduled calls
  AND ends_at <= now

For each expired call:
  Update call:
    status = 'ended'
    ended_at = now

  Log: "Closed call {id}"

Note: Spontaneous calls are NOT auto-closed here.
They close when all participants leave (via /leave endpoint).
```

### 11.5 Worker Configuration

**File:** `/apps/server/src/worker/scheduler.ts`

```typescript
import { scheduler } from '../services/scheduler.js';

// Check if scheduler is enabled
const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED === 'true';

if (SCHEDULER_ENABLED) {
  console.log('[scheduler] Starting scheduler...');

  // Run once on startup
  scheduler.generateScheduledCalls();
  scheduler.activateDueCalls();
  scheduler.closeExpiredCalls();

  // Set up intervals
  setInterval(() => scheduler.generateScheduledCalls(), 60 * 60 * 1000); // 1 hour
  setInterval(() => scheduler.activateDueCalls(), 60 * 1000);            // 1 minute
  setInterval(() => scheduler.closeExpiredCalls(), 60 * 1000);           // 1 minute

  console.log('[scheduler] Scheduler started successfully');
} else {
  console.log('[scheduler] Scheduler disabled');
}
```

**Environment Variable:**
```bash
SCHEDULER_ENABLED=true
```

### 11.6 Edge Cases & Limitations

**Current Limitations:**

1. **In-Memory State:**
   - Intervals are in-memory (not durable)
   - Lost on server restart
   - If server down during scheduled call time, call is missed

2. **Single Process:**
   - Cannot run multiple server instances
   - No distributed locking
   - Race conditions possible

3. **No Retry Logic:**
   - Failed activations not retried
   - Failed push notifications not retried
   - No dead letter queue

4. **Time Resolution:**
   - 1-minute resolution for activation/closure
   - Calls can be up to 1 minute late
   - No sub-minute precision

**Handled Edge Cases:**

1. **Duplicate Calls:**
   - Generator checks for existing scheduled calls
   - Prevents creating duplicate calls for same day/week

2. **Spontaneous Call Preemption:**
   - Activator checks for active spontaneous calls
   - Closes spontaneous call before starting scheduled call
   - Users notified of new scheduled call

3. **Room Expiry Redundancy:**
   - Daily.co room has built-in expiry
   - Scheduler also closes call in database
   - Double guarantee call ends on time

4. **Timezone Handling:**
   - All times stored in UTC
   - Random times generated in server timezone
   - TODO: Use user/group timezone preferences

### 11.7 Future Improvements

**High Priority:**
1. **Durable Job Queue:**
   - Migrate to Bull/BullMQ with Redis
   - Persist jobs across restarts
   - Retry failed jobs with exponential backoff

2. **Distributed Locking:**
   - Support multiple server instances
   - Redis-based locks for job execution
   - Leader election for scheduler

3. **Better Time Resolution:**
   - Sub-minute precision (5-10 seconds)
   - More accurate call start times

**Medium Priority:**
1. **Timezone Support:**
   - Use group owner's timezone
   - Respect "quiet hours" per timezone
   - Allow custom time windows (not just 8am-10pm)

2. **Retry Logic:**
   - Retry failed push notifications
   - Retry failed room creation
   - Dead letter queue for persistent failures

3. **Monitoring:**
   - Metrics: calls generated, activated, closed
   - Alerts: scheduler failures, high latency
   - Dashboard: upcoming calls, success rate

**Low Priority:**
1. **Smart Scheduling:**
   - Avoid holidays
   - Prefer times when most members active
   - Learn from past call attendance

2. **Call Templates:**
   - Pre-schedule specific dates/times
   - Recurring patterns (every Tuesday at 7pm)
   - Mixed automatic + manual scheduling

---

## 12. User Flows

### 12.1 Complete New User Onboarding

```
1. Download & Install
   ↓
2. Open App
   ↓
3. Auth Screen appears
   ↓
4. Enter phone number: +1 (555) 123-4567
   ↓
5. Tap "Send Code"
   ↓
6. Receive SMS: "Your Orbit code is 123456"
   ↓
7. Enter OTP: 123456
   ↓
8. Enter username: "alice"
   ↓
9. Tap "Verify"
   ↓
10. Tokens stored in SecureStore
   ↓
11. Navigate to Home Screen
   ↓
12. See empty state: "No groups yet"
   ↓
13. Tap FAB (+) button
   ↓
14. Create Group Screen opens
   ↓
15. Fill form:
    - Name: "Family Chat"
    - Cadence: Weekly
    - Frequency: 3 times/week
    - Duration: 30 minutes
   ↓
16. Tap "Create Group"
   ↓
17. Group created, user added as owner
   ↓
18. Navigate to Group Detail Screen
   ↓
19. Tap "Invite Members"
   ↓
20. Backend generates code: "ABC12345"
   ↓
21. Code copied to clipboard
   ↓
22. Alert shows code
   ↓
23. Tap "Share"
   ↓
24. Native share dialog opens
   ↓
25. Share via SMS/WhatsApp to family
```

### 12.2 Member Joining Group

```
1. Receive invite message: "Join my Orbit group! Code: ABC12345"
   ↓
2. Download app (if new user)
   ↓
3. Complete authentication (phone + OTP)
   ↓
4. Land on Home Screen
   ↓
5. Tap "Join with Code" button
   ↓
6. Alert prompt appears
   ↓
7. Enter code: ABC12345
   ↓
8. Tap "OK"
   ↓
9. Backend validates:
    - Code exists ✓
    - Not expired ✓
    - Not used ✓
    - User not already member ✓
   ↓
10. Backend adds user to group
    ↓
11. Backend marks invite as used
    ↓
12. Group list refreshes
    ↓
13. "Family Chat" appears in list
    ↓
14. Success toast: "Joined Family Chat!"
```

### 12.3 Scheduled Call Flow

```
Backend (Scheduler):
1. Hourly job runs: generateScheduledCalls()
   ↓
2. For "Family Chat" (weekly, 3x/week):
    - Check existing scheduled calls for next 7 days
    - Found: 2 calls
    - Need: 3 - 2 = 1 more call
   ↓
3. Generate random day: Wednesday
   ↓
4. Generate random time: Wednesday 7:23 PM
   ↓
5. Create CallSession:
    - status: 'scheduled'
    - call_type: 'scheduled'
    - scheduled_at: Wed 7:23 PM
    - ends_at: Wed 7:53 PM (30 min duration)
   ↓
6. [Time passes... Wednesday 7:23 PM arrives]
   ↓
7. Minute job runs: activateDueCalls()
   ↓
8. Finds call where scheduled_at = now
   ↓
9. Check for spontaneous calls:
    - If found: close it, delete room
   ↓
10. Create Daily.co room:
     - Name: "abc123_2025-03-09T19-23-00-000Z"
     - Expiry: Wed 7:53 PM
   ↓
11. Update call:
     - status: 'active'
     - started_at: now
     - room_url: "https://orbit-calls.daily.co/..."
   ↓
12. Fetch group members (5 people)
    ↓
13. Fetch push devices (7 devices total: 3 iOS, 4 Android)
    ↓
14. Send push notifications:
     - APNs to 3 iOS devices
     - FCM to 4 Android devices
     - Title: "Family Chat is calling!"
     - Body: "Tap to join the scheduled call"

Users:
15. All members receive push notification
    ↓
16. Alice taps notification
    ↓
17. App opens to Group Detail Screen
    ↓
18. Sees green banner: "Call in progress"
    ↓
19. Taps "Join Call"
    ↓
20. POST /groups/:id/calls/:callId/join-token
    ↓
21. Backend:
     - Validates call is active
     - Creates Daily.co meeting token
     - Records participant in CallParticipant table
    ↓
22. Navigate to Call Screen with token
    ↓
23. Daily.co SDK connects to room
    ↓
24. Camera/mic permissions requested (first time)
    ↓
25. Video call interface loads
    ↓
26. Alice sees herself (local video, top-right)
    ↓
27. Bob joins → Alice sees Bob (remote video, main)
    ↓
28. Carol joins → Alice sees Bob & Carol (grid layout)
    ↓
29. [30 minutes pass... 7:53 PM arrives]
    ↓
30. Daily.co room auto-expires (by expiry setting)
    ↓
31. Minute job runs: closeExpiredCalls()
    ↓
32. Finds call where ends_at <= now
    ↓
33. Update call:
     - status: 'ended'
     - ended_at: now
    ↓
34. All participants disconnected by Daily.co
    ↓
35. Apps return to Group Detail Screen
```

### 12.4 Spontaneous Call Flow

```
1. User opens app
   ↓
2. Navigate to "Family Chat" group
   ↓
3. Group Detail Screen loads
   ↓
4. Tap "Start Call Now" button
   ↓
5. POST /groups/:id/call-now
   ↓
6. Backend checks:
    - Active call exists? No ✓
    - Scheduled call active? No ✓
   ↓
7. Backend creates Daily.co room:
    - Name: "abc123_2025-03-06T20-15-00-000Z"
    - No expiry (indefinite)
   ↓
8. Backend creates CallSession:
    - status: 'active'
    - call_type: 'spontaneous'
    - started_at: now
    - ends_at: null
    - room_url: "https://..."
   ↓
9. Backend fetches group members + devices
   ↓
10. Backend sends push notifications:
     - Title: "Family Chat is calling!"
     - Body: "Tap to join the call"
   ↓
11. Original user gets meeting token
   ↓
12. Navigate to Call Screen
   ↓
13. Connect to Daily.co room
   ↓
14. Video interface loads
   ↓
15. User alone, sees: "Waiting for others to join..."
   ↓
16. Other members receive push notifications
   ↓
17. Some members join:
     - POST /join-token
     - Connect to Daily.co
     - Appear in video grid
   ↓
18. Call continues indefinitely
   ↓
19. Users can leave/rejoin freely
   ↓
20. User A leaves:
     - Taps "End Call"
     - POST /leave
     - Backend records left_at
     - Backend checks remaining participants
     - Still 2 participants → Keep call open
   ↓
21. User A changes mind, rejoins:
     - POST /join-token (creates new participant record)
     - Connect to Daily.co
     - Back in call
   ↓
22. Eventually, all users leave:
     - Last user taps "End Call"
     - POST /leave
     - Backend records left_at
     - Backend checks remaining participants
     - 0 participants remaining
   ↓
23. Backend closes call:
     - Update status: 'ended'
     - Update ended_at: now
     - Delete Daily.co room
   ↓
24. Call fully closed
```

### 12.5 Scheduled Call Preempting Spontaneous Call

```
Setup:
- "Family Chat" has scheduled call at 7:30 PM
- Currently 7:15 PM

1. Alice starts spontaneous call at 7:15 PM
   ↓
2. Backend creates spontaneous call:
    - call_type: 'spontaneous'
    - status: 'active'
    - ends_at: null
   ↓
3. Daily.co room created (no expiry)
   ↓
4. Push notifications sent
   ↓
5. Bob and Carol join the call
   ↓
6. All 3 users happily chatting
   ↓
7. [15 minutes pass... 7:30 PM arrives]
   ↓
8. Scheduler activateDueCalls() runs
   ↓
9. Finds scheduled call for 7:30 PM
   ↓
10. Checks for active spontaneous calls
    ↓
11. Finds Alice's spontaneous call (active)
    ↓
12. Backend closes spontaneous call:
     - Update status: 'ended'
     - Update ended_at: now
     - Delete Daily.co room
    ↓
13. All 3 users disconnected from spontaneous call
    ↓
14. Apps show disconnection (Daily.co error event)
    ↓
15. Backend creates scheduled call room
    ↓
16. Backend sends push notifications:
     - Title: "Family Chat is calling!"
     - Body: "Tap to join the scheduled call"
    ↓
17. All users (including Alice, Bob, Carol) receive notification
    ↓
18. Users can join new scheduled call
    ↓
19. Scheduled call continues for 30 minutes
    ↓
20. At 8:00 PM, scheduled call auto-closes
```

### 12.6 Blocked Spontaneous Call Scenario

```
Setup:
- Scheduled call active from 7:30-8:00 PM
- Currently 7:45 PM

1. Alice opens app during scheduled call
   ↓
2. Navigate to "Family Chat"
   ↓
3. Sees green banner: "Call in progress"
   ↓
4. Decides to start new spontaneous call instead
   ↓
5. Tap "Start Call Now"
   ↓
6. POST /groups/:id/call-now
   ↓
7. Backend checks for active calls
   ↓
8. Finds active scheduled call
   ↓
9. Backend returns 400 error:
    {
      "error": "Cannot start spontaneous call while scheduled call is active",
      "call": { id, status: "active", call_type: "scheduled", ... }
    }
   ↓
10. App shows error toast:
     "Cannot start call - scheduled call in progress"
    ↓
11. Alice sees options:
     - Join existing scheduled call
     - Wait for scheduled call to end
    ↓
12. Alice taps "Join Call" instead
    ↓
13. POST /join-token for scheduled call
    ↓
14. Successfully joins scheduled call
```

---

## 13. Security

### 13.1 Current Security Measures

**Authentication:**
- ✅ Phone number verification via SMS OTP
- ✅ JWT tokens with short expiration (15 min)
- ✅ Refresh token rotation (30 days)
- ✅ Secure token storage (Expo SecureStore - encrypted)
- ✅ Separate secrets for access and refresh tokens

**Authorization:**
- ✅ Ownership validation (owner-only actions)
- ✅ Membership validation (member-only actions)
- ✅ JWT middleware on all protected endpoints
- ✅ User ID extracted from verified JWT claims

**Data Security:**
- ✅ Private video rooms (require meeting tokens)
- ✅ User-specific meeting tokens (cannot be reused)
- ✅ Cascade deletes for data integrity
- ✅ Unique constraints on critical fields (phone, username, invite codes)

**Database Security:**
- ✅ Parameterized queries via Prisma (SQL injection prevention)
- ✅ Foreign key constraints
- ✅ Indexes on queried fields

### 13.2 Security Improvements Needed

**Rate Limiting:**
- ❌ No rate limiting on OTP requests (abuse risk)
- ❌ No rate limiting on API endpoints (DoS risk)
- ❌ No login attempt throttling

**Recommendation:**
```typescript
import rateLimit from 'express-rate-limit';

// OTP request limiter: 3 requests per hour per phone
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyGenerator: (req) => req.body.phone,
  message: 'Too many OTP requests, please try again later',
});

app.post('/auth/request-otp', otpLimiter, otpHandler);

// General API limiter: 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later',
});

app.use('/api', apiLimiter);
```

**Input Validation:**
- ⚠️ Basic validation on some endpoints (Zod schemas)
- ❌ No XSS protection for user-generated content
- ❌ No HTML sanitization

**Recommendation:**
```typescript
import DOMPurify from 'isomorphic-dompurify';

// Sanitize user inputs
const sanitizeInput = (input: string): string => {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
};

// Apply to usernames, group names, etc.
username = sanitizeInput(username);
```

**Logging & Monitoring:**
- ❌ No request logging
- ❌ No error tracking (Sentry, etc.)
- ❌ No audit trail for sensitive actions

**Recommendation:**
```typescript
import * as Sentry from '@sentry/node';
import winston from 'winston';

// Error tracking
Sentry.init({ dsn: process.env.SENTRY_DSN });

// Request logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Log all requests
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
    userId: req.userId,
  });
  next();
});
```

**Additional Security Measures:**

1. **HTTPS Only:**
   - ✅ Should be enforced in production
   - Use Helmet.js for security headers

2. **CORS Configuration:**
   - ⚠️ Should be configured for production domain
   ```typescript
   app.use(cors({
     origin: process.env.ALLOWED_ORIGINS?.split(','),
     credentials: true,
   }));
   ```

3. **Secrets Management:**
   - ⚠️ Secrets in .env file (acceptable for now)
   - ❌ No secret rotation
   - Recommendation: Use AWS Secrets Manager or HashiCorp Vault

4. **Device Fingerprinting:**
   - ❌ No device fingerprinting
   - Would help detect account takeover
   - Recommendation: Store device info (model, OS) with push tokens

### 13.3 Privacy Considerations

**Data Minimization:**
- ✅ Only collect necessary data (phone, username, timezone)
- ✅ No email addresses
- ✅ No payment information (yet)
- ❌ No privacy policy (required for App Store)

**Data Retention:**
- ⚠️ Ended calls kept indefinitely
- Recommendation: Auto-delete calls older than 90 days
- Recommendation: Soft-delete users (mark inactive, keep data 30 days)

**Data Export:**
- ❌ No user data export endpoint (GDPR requirement)
- Recommendation: Implement `GET /me/export` endpoint

**Account Deletion:**
- ❌ No self-service account deletion
- Recommendation: Implement `DELETE /me` endpoint
- Should cascade delete: groups (if owner), memberships, devices, participants

### 13.4 Video Call Security

**Daily.co Security Features:**
- ✅ Private rooms (require tokens)
- ✅ User-specific tokens (expire with call)
- ✅ Rooms auto-expire (scheduled calls)
- ✅ WebRTC encryption (built-in)

**Potential Issues:**
- ⚠️ Meeting tokens don't expire for spontaneous calls
- ⚠️ No waiting room (anyone with token can join)
- ⚠️ No host controls (mute, remove participant)

**Recommendations:**
1. Add token expiry for spontaneous calls (e.g., 4 hours max)
2. Add "knock" feature (optional: require host approval)
3. Add host role (group owner as host, can remove participants)

---

## 14. Development Status

### 14.1 Completed Features

**Backend (90%):**
- ✅ Database schema with all models and relations
- ✅ All API endpoints (auth, groups, calls)
- ✅ Phone authentication with Twilio Verify
- ✅ JWT access and refresh tokens
- ✅ Daily.co video integration (rooms, tokens)
- ✅ Push notifications (FCM + APNs)
- ✅ Scheduler service (generate, activate, close)
- ✅ Two-track call system (spontaneous + scheduled)
- ✅ Call preemption logic
- ✅ Invite system with codes
- ✅ Input validation (Zod schemas)
- ✅ Cascade deletes
- ✅ Development mode fallbacks

**Mobile (85%):**
- ✅ Authentication flow (phone + OTP + username)
- ✅ Navigation (Stack + Tabs)
- ✅ All core screens (Auth, Home, GroupDetail, CreateGroup, Call, Settings)
- ✅ Daily.co video integration (SDK, DailyMediaView)
- ✅ Push notification registration
- ✅ Push notification handling (foreground, background)
- ✅ Invite code generation and joining
- ✅ Pull-to-refresh
- ✅ Loading states
- ✅ Error handling
- ✅ Token refresh interceptor
- ✅ Auto-logout on refresh failure
- ✅ Local video (self-view, mirrored)
- ✅ Remote video (grid layout)

**Infrastructure (75%):**
- ✅ Monorepo structure (apps + packages)
- ✅ TypeScript throughout
- ✅ Prisma ORM with migrations
- ✅ Environment configuration
- ✅ Development mode for all services
- ✅ Git repository with branches

### 14.2 Known Issues & Limitations

**Backend:**
1. **Scheduler not durable:**
   - In-memory intervals
   - Lost on restart
   - No retry logic
   - Single-process only

2. **No rate limiting:**
   - OTP requests can be abused
   - API endpoints can be DoS'd

3. **No monitoring:**
   - No metrics
   - No error tracking
   - No performance monitoring

4. **Limited logging:**
   - Console.log only
   - No structured logging
   - No log aggregation

5. **Manual database migrations:**
   - Must be applied manually to production
   - No automated migration runner

**Mobile:**
1. **No deep link handling:**
   - `orbit://invite/{CODE}` links don't open app
   - Need to configure URL scheme + handle in app

2. **Push notifications don't navigate:**
   - Tapping notification opens app
   - Doesn't auto-navigate to group/call
   - Need to implement notification response handler

3. **No offline caching:**
   - All data from API
   - No AsyncStorage persistence
   - Groups list lost on app restart

4. **No timezone picker:**
   - Timezone hardcoded to UTC
   - Settings screen shows it but can't edit

5. **No group settings edit:**
   - Owner can't edit group name, cadence, duration
   - Would need PATCH /groups/:id endpoint (exists) + mobile UI

6. **No call history UI:**
   - GET /groups/:id/calls/history exists
   - No mobile screen to display it

7. **No participant list in call:**
   - Can see video, but no names
   - No indicator of who's talking

**Both:**
1. **No automated tests:**
   - No unit tests
   - No integration tests
   - No E2E tests

2. **No CI/CD:**
   - No automated builds
   - No automated deployments
   - Manual testing only

3. **No production deployment:**
   - No backend hosting
   - No mobile app builds (EAS)
   - No App Store/Play Store submission

4. **No documentation:**
   - No API docs (Swagger/OpenAPI)
   - No developer guide
   - No deployment guide

### 14.3 Remaining Work

**High Priority (Blockers for Production):**

1. **Deep link handling:**
   - Configure `orbit://` URL scheme
   - Handle incoming links in App.tsx
   - Navigate to join flow with code

2. **Push notification navigation:**
   - Implement `Notifications.addNotificationResponseReceivedListener`
   - Extract `callId` and `groupId` from data
   - Navigate to GroupDetailScreen → auto-join if call active

3. **Durable job queue:**
   - Install Bull + Redis
   - Migrate scheduler intervals to Bull jobs
   - Add retry logic
   - Add monitoring

4. **Rate limiting:**
   - Install express-rate-limit
   - Add OTP rate limiter (3 per hour per phone)
   - Add API rate limiter (100 per 15 min per IP)

5. **Error tracking:**
   - Install Sentry (backend + mobile)
   - Configure error reporting
   - Add custom error boundaries

6. **Production deployment:**
   - Backend: Railway/Render/Fly.io
   - Database: Supabase/Neon
   - Configure environment variables
   - Set up HTTPS/SSL
   - Configure CORS

7. **Mobile app builds:**
   - Configure EAS (Expo Application Services)
   - Build iOS + Android
   - Test on physical devices
   - Submit to App Store + Play Store

**Medium Priority (Quality of Life):**

1. **Timezone support:**
   - Add timezone picker to settings
   - Store in user.time_zone
   - Use for scheduler (generate calls in user TZ)

2. **Group settings edit:**
   - Add GroupEditScreen (mobile)
   - Call PATCH /groups/:id
   - Owner-only

3. **Call history UI:**
   - Add CallHistoryScreen (mobile)
   - Call GET /groups/:id/calls/history
   - Show past calls with duration, participants

4. **Offline caching:**
   - Install AsyncStorage
   - Cache groups list
   - Cache user profile
   - Sync on reconnect

5. **Improved error messages:**
   - User-friendly error messages
   - Specific guidance (e.g., "Check your internet connection")

6. **Loading skeletons:**
   - Replace spinners with skeleton screens
   - Better perceived performance

**Low Priority (Nice to Have):**

1. **Call countdown timer:**
   - Show remaining time for scheduled calls
   - "Call ends in 5 minutes"

2. **Participant list in call:**
   - Show names of participants
   - Indicator for who's speaking

3. **Network quality indicator:**
   - Show connection quality (good/medium/poor)
   - Daily.co provides network stats API

4. **Call recordings:**
   - Optional recording feature
   - Requires consent from all participants
   - Daily.co supports cloud recording

5. **Profile pictures:**
   - Upload avatar image
   - Show in member list, video call

6. **Group themes:**
   - Custom colors/backgrounds
   - Personalization

7. **Call games/icebreakers:**
   - Built-in activities during calls
   - Prompts, questions, etc.

### 14.4 Testing Status

**Current State:**
- ❌ 0% test coverage
- ❌ No unit tests
- ❌ No integration tests
- ❌ No E2E tests
- ⚠️ Manual testing only

**Testing Plan:**

**Backend Unit Tests:**
```typescript
// Example: scheduler.test.ts
describe('Scheduler Service', () => {
  describe('getRandomTime', () => {
    it('should return time between start and end', () => {
      const start = new Date('2025-03-06T08:00:00Z');
      const end = new Date('2025-03-06T22:00:00Z');
      const result = scheduler.getRandomTime(start, end);
      expect(result.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(result.getTime()).toBeLessThanOrEqual(end.getTime());
    });
  });

  describe('getRandomTimesForWeek', () => {
    it('should generate N unique days', () => {
      const start = new Date('2025-03-10T00:00:00Z');
      const times = scheduler.getRandomTimesForWeek(start, 3);
      expect(times.length).toBe(3);

      // Check all on different days
      const days = times.map(t => t.getDate());
      const uniqueDays = new Set(days);
      expect(uniqueDays.size).toBe(3);
    });
  });
});
```

**Backend Integration Tests:**
```typescript
// Example: auth.integration.test.ts
describe('POST /auth/verify-otp', () => {
  it('should create new user and return tokens', async () => {
    const response = await request(app)
      .post('/auth/verify-otp')
      .send({
        phone: '+14155551234',
        code: '123456', // Dev mode accepts any code
        username: 'testuser',
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('access_token');
    expect(response.body).toHaveProperty('refresh_token');
    expect(response.body.user.username).toBe('testuser');
  });
});
```

**Mobile E2E Tests:**
```typescript
// Example: auth.e2e.test.ts (Detox)
describe('Authentication', () => {
  it('should login with phone and OTP', async () => {
    await element(by.id('phone-input')).typeText('5551234567');
    await element(by.id('send-code-button')).tap();

    await waitFor(element(by.id('otp-input')))
      .toBeVisible()
      .withTimeout(5000);

    await element(by.id('otp-input')).typeText('123456');
    await element(by.id('username-input')).typeText('testuser');
    await element(by.id('verify-button')).tap();

    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(5000);
  });
});
```

---

## 15. Deployment

### 15.1 Backend Deployment

**Recommended Platform: Railway.app**

**Why Railway?**
- Easy deployment (connect GitHub)
- Built-in PostgreSQL
- Environment variable management
- Automatic HTTPS
- Reasonable pricing ($5-20/month)

**Alternative Platforms:**
- Render.com
- Fly.io
- AWS Elastic Beanstalk
- DigitalOcean App Platform

**Deployment Steps:**

1. **Prepare Backend:**
```bash
# Ensure package.json has start script
"scripts": {
  "start": "node dist/index.js",
  "build": "tsc",
  "dev": "tsx watch src/index.ts"
}

# Add Procfile (optional, for some platforms)
web: npm start
```

2. **Database Setup:**
```bash
# Option 1: Railway PostgreSQL (built-in)
# - Create project
# - Add PostgreSQL plugin
# - Copy DATABASE_URL

# Option 2: Supabase (current)
# - Already using Supabase
# - DATABASE_URL already set

# Option 3: Neon (serverless PostgreSQL)
# - Create project at neon.tech
# - Copy connection string
```

3. **Environment Variables:**
```bash
# Set in Railway dashboard (or platform equivalent)
NODE_ENV=production
DATABASE_URL=postgresql://...
PORT=4000

# JWT
JWT_SECRET=generate-strong-secret-here
JWT_EXPIRES_IN=900
REFRESH_TOKEN_SECRET=generate-strong-secret-here
REFRESH_TOKEN_EXPIRES_IN=2592000

# Twilio Verify
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_VERIFY_SERVICE_SID=VAxxxxx

# Daily.co
DAILY_API_KEY=xxxxx
DAILY_DOMAIN=your-domain.daily.co

# Push Notifications
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/firebase-service-account.json
APNS_KEY_ID=xxxxx
APNS_TEAM_ID=xxxxx
APNS_KEY_PATH=/app/credentials/AuthKey_xxxxx.p8
APNS_BUNDLE_ID=com.mylesharris.orbit
APNS_PRODUCTION=true

# Scheduler
SCHEDULER_ENABLED=true
```

4. **Build Configuration:**
```json
// package.json
{
  "engines": {
    "node": ">=18.0.0"
  }
}
```

5. **Deploy:**
```bash
# Railway (via GitHub)
# - Connect GitHub repo
# - Select branch (main)
# - Railway auto-detects Node.js
# - Runs npm install && npm run build && npm start

# Manual deploy (other platforms)
git push heroku main
# or
fly deploy
```

6. **Post-Deployment:**
```bash
# Run migrations (if not auto-run)
DATABASE_URL=production-url npx prisma migrate deploy

# Verify deployment
curl https://your-app.railway.app/health

# Check logs
railway logs
# or
fly logs
```

**Production Checklist:**
- ✅ DATABASE_URL points to production database
- ✅ Strong JWT secrets (generate with `openssl rand -hex 32`)
- ✅ NODE_ENV=production
- ✅ APNS_PRODUCTION=true
- ✅ All credentials uploaded (firebase JSON, APNs .p8)
- ✅ HTTPS enabled (automatic on Railway)
- ✅ CORS configured for production domain
- ✅ Migrations applied
- ✅ Scheduler enabled
- ✅ Health endpoint responding

### 15.2 Mobile Deployment

**Build with Expo Application Services (EAS)**

**Setup:**
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project
eas build:configure
```

**Configure `eas.json`:**
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "ios": {
        "bundleIdentifier": "com.mylesharris.orbit",
        "buildConfiguration": "Release"
      },
      "android": {
        "buildType": "apk"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "your-app-id",
        "appleTeamId": "your-team-id"
      },
      "android": {
        "serviceAccountKeyPath": "./path/to/google-play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

**Update API URL:**
```typescript
// apps/mobile/src/config.ts
export const API_URL =
  __DEV__
    ? 'http://localhost:4000'
    : 'https://your-app.railway.app';
```

**Build for iOS:**
```bash
# Development build (for testing)
eas build --platform ios --profile development

# Production build (for App Store)
eas build --platform ios --profile production
```

**Build for Android:**
```bash
# Development build
eas build --platform android --profile development

# Production build
eas build --platform android --profile production
```

**Submit to App Stores:**

**iOS (App Store):**
1. Create app in App Store Connect
2. Configure app metadata:
   - Name: "Orbit"
   - Description: "Stay connected with randomized group video calls"
   - Category: Social Networking
   - Screenshots (required sizes)
   - Privacy policy URL
   - Terms of service URL
3. Submit build:
```bash
eas submit --platform ios --profile production
```
4. Wait for Apple review (1-3 days)

**Android (Google Play):**
1. Create app in Google Play Console
2. Configure app details:
   - App name: "Orbit"
   - Description
   - Category: Social
   - Screenshots
   - Privacy policy URL
3. Submit build:
```bash
eas submit --platform android --profile production
```
4. Wait for Google review (hours to days)

**TestFlight (iOS Beta Testing):**
```bash
# After production build
eas submit --platform ios --profile production

# Share TestFlight link
# Testers get automatic updates
```

**Google Play Internal Testing:**
```bash
# Submit to internal track
eas submit --platform android --track internal

# Add testers by email
# Testers join via Google Play link
```

### 15.3 Monitoring & Observability

**Backend Monitoring:**

**Error Tracking (Sentry):**
```typescript
// apps/server/src/index.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// Sentry error handler (after routes)
app.use(Sentry.Handlers.errorHandler());
```

**Logging (Winston):**
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Use throughout app
logger.info('Server started', { port: 4000 });
logger.error('Database connection failed', { error: err });
```

**Metrics (Prometheus + Grafana):**
```typescript
import promClient from 'prom-client';

const register = new promClient.Registry();

// Metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
});

register.registerMetric(httpRequestDuration);

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

**Mobile Monitoring:**

**Error Tracking (Sentry):**
```typescript
// App.tsx
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
});

export default Sentry.wrap(App);
```

**Analytics (Expo Analytics or Mixpanel):**
```typescript
import * as Analytics from 'expo-firebase-analytics';

// Track events
await Analytics.logEvent('call_started', {
  group_id: groupId,
  call_type: 'spontaneous',
});

await Analytics.logEvent('call_ended', {
  group_id: groupId,
  duration_seconds: duration,
});
```

### 15.4 Backups & Disaster Recovery

**Database Backups:**

**Supabase (current):**
- Automatic daily backups
- Point-in-time recovery (paid plan)
- Download backups from dashboard

**Manual Backup:**
```bash
# Export database
pg_dump $DATABASE_URL > backup.sql

# Restore database
psql $DATABASE_URL < backup.sql
```

**Automated Backups:**
```bash
# Cron job (daily at 2am)
0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/orbit_$(date +\%Y\%m\%d).sql.gz

# Keep last 30 days
find /backups -name "orbit_*.sql.gz" -mtime +30 -delete
```

**Disaster Recovery Plan:**

1. **Database failure:**
   - Restore from latest backup
   - Point-in-time recovery if available
   - Verify data integrity

2. **Server failure:**
   - Deploy to new instance
   - Point to backup database
   - Update DNS if needed

3. **Data corruption:**
   - Identify corruption timestamp
   - Restore from backup before corruption
   - Replay events after restoration

4. **Complete loss:**
   - Deploy infrastructure from scratch
   - Restore latest database backup
   - Reconfigure all services
   - Notify users of potential data loss

---

## 16. Future Roadmap

### 16.1 Near-Term Features (3-6 months)

**1. Deep Links & Better Onboarding**
- `orbit://invite/{CODE}` opens app to join flow
- Better first-time user experience
- Tutorial/walkthrough screens

**2. Call History**
- View past calls (mobile UI)
- Filter by date, duration
- See who participated

**3. Group Settings Management**
- Edit group name, cadence, duration (mobile UI)
- Transfer ownership
- Archive/unarchive groups

**4. Timezone Support**
- User timezone picker
- Scheduler respects timezone
- Custom "quiet hours" (no calls before 8am)

**5. Call Improvements**
- Countdown timer (scheduled calls)
- Participant list with names
- Network quality indicator
- Mute all (owner only)

**6. Notifications Enhancements**
- Reminders (5 min before scheduled call)
- Missed call notifications
- Group activity (new member, settings changed)

**7. Better Error Handling**
- Retry failed operations
- Offline mode support
- User-friendly error messages

### 16.2 Medium-Term Features (6-12 months)

**1. Web Application**
- Browser-based client
- Same features as mobile
- Desktop notifications

**2. Call Recording**
- Optional recording with consent
- Cloud storage (Daily.co integration)
- Download/share recordings

**3. Screen Sharing**
- Share screen during calls
- Mobile screen share (Android/iOS)
- Desktop screen share (web)

**4. Profile Pictures**
- Upload avatar
- Show in member list
- Show in video call (overlay)

**5. Group Chat**
- Text messages between calls
- Media sharing (photos)
- Message history

**6. Calendar Integration**
- Sync scheduled calls to Google Calendar
- iCal export
- Add to calendar button

**7. Call Quality Feedback**
- Post-call rating (1-5 stars)
- Issues reporting (audio, video, lag)
- Analytics for improvement

**8. Multiple Invite Links**
- Different links for different permissions
- Revocable links
- Link expiry customization

### 16.3 Long-Term Vision (12+ months)

**1. Premium Features / Monetization**
- Free tier: 1 group, daily calls, 30 min max
- Premium: Unlimited groups, longer calls, recording
- Family plan: Multiple groups, shared features
- Pricing: $5/month individual, $10/month family

**2. Advanced Scheduling**
- Mix of random and fixed schedules
- Custom time windows per day
- Avoid holidays/special dates
- Smart scheduling (learn from attendance)

**3. Call Activities**
- Built-in games/icebreakers
- Question prompts
- Virtual backgrounds
- Filters/effects

**4. AI Features**
- Auto-transcription
- Meeting summaries
- Action items extraction
- Smart highlights

**5. Integrations**
- Slack (notify in channel)
- Discord (bridge to voice channel)
- Zoom (import/export meetings)
- Notion (meeting notes)

**6. Analytics Dashboard**
- Personal stats (total call time, attendance rate)
- Group stats (most active members, best times)
- Insights (suggested schedule changes)

**7. Multi-Language Support**
- Internationalization (i18n)
- Localized UI
- Translated notifications

**8. Accessibility Features**
- Closed captions (live)
- Screen reader support
- High contrast mode
- Keyboard navigation (web)

### 16.4 Research & Exploration

**1. Alternative Video Providers**
- Evaluate Agora, Livekit, Jitsi
- Cost comparison
- Feature comparison

**2. P2P Mesh Networking**
- Reduce server costs
- Lower latency
- Better quality for small groups

**3. End-to-End Encryption**
- Privacy-focused calls
- Zero-knowledge architecture
- Compliance with regulations

**4. Offline-First Architecture**
- Local-first data storage
- Sync when online
- Conflict resolution

**5. AI-Powered Moderation**
- Content moderation (text)
- Behavior detection (harassment)
- Automated warnings/bans

---

## Appendix A: Environment Variables Reference

### Backend (.env)

```bash
# ===== Database =====
DATABASE_URL=postgresql://user:password@host:5432/dbname

# ===== Server =====
PORT=4000
NODE_ENV=development  # or production

# ===== JWT Authentication =====
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=900  # 15 minutes in seconds
REFRESH_TOKEN_SECRET=your-refresh-secret-key-change-in-production
REFRESH_TOKEN_EXPIRES_IN=2592000  # 30 days in seconds

# ===== Twilio Verify (OTP) =====
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ===== Daily.co Video =====
DAILY_API_KEY=your_daily_api_key
DAILY_DOMAIN=your-subdomain.daily.co

# ===== Push Notifications (Firebase) =====
GOOGLE_APPLICATION_CREDENTIALS=./credentials/firebase-service-account.json

# ===== Push Notifications (APNs) =====
APNS_KEY_ID=ABC1234567
APNS_TEAM_ID=XYZ9876543
APNS_KEY_PATH=./credentials/AuthKey_ABC1234567.p8
APNS_BUNDLE_ID=com.mylesharris.orbit
APNS_PRODUCTION=false  # true for production

# ===== Scheduler =====
SCHEDULER_ENABLED=true

# ===== Logging =====
LOG_LEVEL=info  # debug, info, warn, error
```

### Mobile (.env or app.config.js)

```bash
# ===== API Configuration =====
EXPO_PUBLIC_API_BASE=http://localhost:4000  # or https://your-app.railway.app

# ===== Error Tracking =====
EXPO_PUBLIC_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx

# ===== Analytics =====
EXPO_PUBLIC_ANALYTICS_KEY=your_analytics_key
```

---

## Appendix B: API Request/Response Examples

### Authentication

**Request OTP:**
```bash
curl -X POST http://localhost:4000/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+14155551234"}'
```

**Verify OTP:**
```bash
curl -X POST http://localhost:4000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+14155551234",
    "code": "123456",
    "username": "alice"
  }'
```

**Refresh Token:**
```bash
curl -X POST http://localhost:4000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "eyJhbGc..."}'
```

### Groups

**Create Group:**
```bash
curl -X POST http://localhost:4000/groups \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Family Chat",
    "cadence": "weekly",
    "weekly_frequency": 3,
    "call_duration_minutes": 30
  }'
```

**Generate Invite:**
```bash
curl -X POST http://localhost:4000/groups/{groupId}/invite \
  -H "Authorization: Bearer eyJhbGc..."
```

**Join Group:**
```bash
curl -X POST http://localhost:4000/groups/{groupId}/join \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{"invite_code": "ABC12345"}'
```

### Calls

**Start Call Now:**
```bash
curl -X POST http://localhost:4000/groups/{groupId}/call-now \
  -H "Authorization: Bearer eyJhbGc..."
```

**Get Join Token:**
```bash
curl -X POST http://localhost:4000/groups/{groupId}/calls/{callId}/join-token \
  -H "Authorization: Bearer eyJhbGc..."
```

**Leave Call:**
```bash
curl -X POST http://localhost:4000/groups/{groupId}/calls/{callId}/leave \
  -H "Authorization: Bearer eyJhbGc..."
```

---

## Appendix C: Database Queries

**Find user's groups:**
```sql
SELECT g.*, COUNT(gm.id) as member_count
FROM "Group" g
JOIN "GroupMember" gm ON gm.group_id = g.id
WHERE gm.user_id = $userId
GROUP BY g.id;
```

**Find active call for group:**
```sql
SELECT cs.*,
  json_agg(json_build_object(
    'id', cp.id,
    'user_id', cp.user_id,
    'joined_at', cp.joined_at
  )) FILTER (WHERE cp.left_at IS NULL) as participants
FROM "CallSession" cs
LEFT JOIN "CallParticipant" cp ON cp.call_id = cs.id
WHERE cs.group_id = $groupId
  AND cs.status = 'active'
GROUP BY cs.id;
```

**Find scheduled calls due now:**
```sql
SELECT cs.*, g.*,
  json_agg(json_build_object(
    'user_id', u.id,
    'devices', (
      SELECT json_agg(json_build_object('token', pd.token, 'platform', pd.platform))
      FROM "PushDevice" pd
      WHERE pd.user_id = u.id
    )
  )) as members
FROM "CallSession" cs
JOIN "Group" g ON g.id = cs.group_id
JOIN "GroupMember" gm ON gm.group_id = g.id
JOIN "User" u ON u.id = gm.user_id
WHERE cs.status = 'scheduled'
  AND cs.scheduled_at >= NOW() - INTERVAL '1 minute'
  AND cs.scheduled_at <= NOW()
GROUP BY cs.id, g.id;
```

---

## Appendix D: Troubleshooting Guide

**Backend Issues:**

**Problem: Server won't start**
```
Check:
- DATABASE_URL is correct
- PostgreSQL is running
- Prisma migrations applied (npx prisma migrate deploy)
- Node version >= 18
- Dependencies installed (npm install)
```

**Problem: Scheduler not generating calls**
```
Check:
- SCHEDULER_ENABLED=true in .env
- Groups exist with valid cadence
- Check logs for errors
- Verify time/timezone settings
```

**Problem: Push notifications not sending**
```
Check:
- Firebase credentials correct (GOOGLE_APPLICATION_CREDENTIALS)
- APNs credentials correct (APNS_KEY_PATH, etc.)
- Device tokens registered
- Check logs for API errors
```

**Mobile Issues:**

**Problem: Can't login (OTP not working)**
```
Check:
- Twilio credentials configured
- Phone number format (E.164: +1234567890)
- Dev mode: check server console for OTP code
- Network connectivity
```

**Problem: Video call not connecting**
```
Check:
- Daily.co credentials configured
- Camera/mic permissions granted
- Network connectivity (WebRTC requires open ports)
- Token not expired
```

**Problem: Push notifications not received**
```
Check:
- Permissions granted (iOS: Settings > Notifications > Orbit)
- Token registered (check PushDevice table)
- APNs certificate correct (dev vs production)
- App in foreground vs background (different handlers)
```

---

## Document Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-03-06 | System | Initial comprehensive PRD |

---

## Conclusion

This PRD documents the complete feature set, architecture, and implementation details of the Orbit application as of March 2025. The app is approximately **85% complete** for core features and ready for beta testing with real users.

**Key Strengths:**
- Solid technical foundation
- Complete two-track call system
- Good separation of concerns
- Development mode for all services
- Scalable architecture

**Next Steps for Production:**
1. Implement deep link handling
2. Add durable job queue
3. Set up monitoring and error tracking
4. Deploy backend to production
5. Build and submit mobile apps

For questions or contributions, please refer to the README.md and DEVELOPMENT_STATUS.md files.
