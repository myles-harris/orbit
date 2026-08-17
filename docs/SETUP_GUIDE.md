# Orbit - Setup Guide

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ (for backend database)
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac only) or Android Emulator
- Twilio account (for OTP and video calls)
- Firebase project (for Android push notifications)
- Apple Developer account (for iOS push notifications)

---

## Backend Setup

### 1. Install Dependencies

```bash
cd apps/server
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/orbit_dev

# JWT (generate a strong secret)
JWT_SECRET=your-super-secret-jwt-key-change-this

# Twilio (get from https://console.twilio.com)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=your_twilio_api_key_secret
TWILIO_PHONE_NUMBER=+1234567890

# Push Notifications (optional for development)
FCM_SERVER_KEY=your_fcm_server_key
APNS_KEY_ID=your_apns_key_id
APNS_TEAM_ID=your_team_id
APNS_KEY_PATH=./path/to/AuthKey_XXXXX.p8
APNS_BUNDLE_ID=com.orbit.app
```

### 3. Set Up PostgreSQL

**Option A: Local PostgreSQL**

```bash
# Install PostgreSQL (macOS)
brew install postgresql
brew services start postgresql

# Create database
createdb orbit_dev
```

**Option B: Docker**

```bash
docker run --name orbit-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:14

# Create database
docker exec -it orbit-postgres psql -U postgres -c "CREATE DATABASE orbit_dev;"
```

**Option C: Cloud (Railway, Neon, Supabase)**

Get a connection string and update `DATABASE_URL` in `.env`

### 4. Run Database Migrations

```bash
npx prisma migrate dev --name initial_schema
npx prisma generate
```

### 5. Start the Server

```bash
npm run dev
```

Server will start on `http://localhost:3000`

### 6. Verify Server is Running

```bash
curl http://localhost:3000/health
```

Should return: `{"status":"ok"}`

---

## Mobile App Setup

### 1. Install Dependencies

```bash
cd apps/mobile
npm install
```

### 2. Configure API Endpoint

The mobile app currently connects to the API server. Make sure to update the API URL in the code if needed (currently set to localhost).

### 3. Start Expo

```bash
npm start
```

This will open the Expo DevTools in your browser.

### 4. Run on iOS Simulator (Mac only)

Press `i` in the terminal or click "Run on iOS simulator" in Expo DevTools.

### 5. Run on Android Emulator

Press `a` in the terminal or click "Run on Android device/emulator" in Expo DevTools.

Make sure you have an Android emulator running first:

```bash
# Open Android Studio > AVD Manager > Start an emulator
```

### 6. Run on Physical Device

Install the Expo Go app on your iPhone or Android device, then scan the QR code shown in the terminal.

---

## Twilio Setup

### 1. Create Twilio Account

Sign up at https://www.twilio.com

### 2. Set Up Verify Service

1. Go to Console → Verify → Services
2. Create a new Verify Service
3. Copy the Service SID → `TWILIO_VERIFY_SERVICE_SID`

### 3. Set Up Video

1. Go to Console → Video → Settings
2. Enable "Programmable Video"
3. Create an API Key:
   - Go to Console → Account → API Keys & Tokens
   - Create API Key
   - Copy SID → `TWILIO_API_KEY_SID`
   - Copy Secret → `TWILIO_API_KEY_SECRET`

### 4. Get Phone Number (for SMS fallback)

1. Go to Console → Phone Numbers
2. Buy a phone number
3. Copy number → `TWILIO_PHONE_NUMBER`

---

## Push Notifications Setup

### Android (Firebase Cloud Messaging)

1. Create Firebase project at https://console.firebase.google.com
2. Add an Android app
3. Go to Project Settings → Cloud Messaging
4. Copy "Server Key" → `FCM_SERVER_KEY`
5. Download `google-services.json` and place in mobile app

### iOS (Apple Push Notification Service)

1. Log in to Apple Developer account
2. Create an APNs Auth Key:
   - Certificates, Identifiers & Profiles → Keys
   - Create a new key with APNs enabled
   - Download the `.p8` file
3. Set environment variables:
   - `APNS_KEY_ID` - Key ID from Apple
   - `APNS_TEAM_ID` - Team ID from Apple Developer account
   - `APNS_KEY_PATH` - Path to `.p8` file
   - `APNS_BUNDLE_ID` - Your app bundle ID

---

## Development Workflow

### Running the Full Stack

1. **Terminal 1 - Backend Server:**
   ```bash
   cd apps/server
   npm run dev
   ```

2. **Terminal 2 - Mobile App:**
   ```bash
   cd apps/mobile
   npm start
   ```

3. **Optional - Standalone Scheduler:**
   ```bash
   cd apps/server
   node dist/worker/scheduler.js
   ```
   Note: The scheduler is also started automatically with the main server.

### Testing OTP Flow (Development Mode)

When Twilio is not configured, the backend accepts any 6-digit code:

1. Enter phone number: `+16789517549`
2. Request OTP (logs to console, not sent)
3. Enter any 6-digit code: `123456`
4. Should successfully authenticate

### Testing Push Notifications (Development Mode)

When FCM/APNs are not configured, push notifications are logged to console:

```
[push] STUB: Would send APNs to 2 iOS devices: Saturday Crew is calling! - Tap to join the call
```

---

## Common Issues

### Issue: Database connection error

**Error:** `P1010: User was denied access on the database`

**Solution:**
- Make sure PostgreSQL is running: `brew services start postgresql`
- Verify DATABASE_URL in `.env`
- Create database: `createdb orbit_dev`

### Issue: Prisma client not generated

**Error:** `Cannot find module '@prisma/client'`

**Solution:**
```bash
cd apps/server
npx prisma generate
```

### Issue: Port 3000 already in use

**Solution:**
```bash
# Find and kill the process
lsof -ti:3000 | xargs kill

# Or change PORT in .env
PORT=3001
```

### Issue: Expo stuck on "Starting Metro Bundler"

**Solution:**
```bash
# Clear Expo cache
cd apps/mobile
npx expo start -c
```

### Issue: TypeScript errors in mobile app

**Solution:**
```bash
cd apps/mobile
npm run typecheck
```

---

## Database Management

### View Data in Prisma Studio

```bash
cd apps/server
npx prisma studio
```

Opens a web interface at `http://localhost:5555` to browse/edit data.

### Reset Database

```bash
cd apps/server
npx prisma migrate reset
```

**Warning:** This deletes all data!

### Create a New Migration

After changing `schema.prisma`:

```bash
npx prisma migrate dev --name your_migration_name
```

---

## Testing API Endpoints

### Using cURL

```bash
# Request OTP
curl -X POST http://localhost:3000/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+16789517549"}'

# Verify OTP
curl -X POST http://localhost:3000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+16789517549", "code": "123456", "username": "john"}'

# Get user profile (with JWT token)
curl http://localhost:3000/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Using Postman

Import these endpoints:
- Base URL: `http://localhost:3000`
- All authenticated endpoints need `Authorization: Bearer {token}` header

---

## Production Deployment

### Backend (Server)

Recommended platforms:
- Railway.app
- Render.com
- Fly.io
- AWS Elastic Beanstalk

**Environment variables to set:**
- All variables from `.env.example`
- `NODE_ENV=production`
- `DATABASE_URL` (production PostgreSQL)
- Production Twilio credentials
- Production FCM/APNs credentials

### Mobile App

1. Build with Expo:
   ```bash
   cd apps/mobile
   eas build --platform all
   ```

2. Submit to app stores:
   ```bash
   eas submit --platform all
   ```

See [Expo docs](https://docs.expo.dev/build/introduction/) for detailed build/submit guides.

---

## Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Expo Documentation](https://docs.expo.dev)
- [React Navigation](https://reactnavigation.org/docs/getting-started)
- [Twilio Video Docs](https://www.twilio.com/docs/video)
- [Twilio Verify Docs](https://www.twilio.com/docs/verify/api)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)

---

## Support

For issues or questions:
1. Check [DEVELOPMENT_STATUS.md](./DEVELOPMENT_STATUS.md) for known issues
2. Review error logs in terminal
3. Check Prisma/Expo/Twilio documentation

---

Last Updated: 2025-11-15
