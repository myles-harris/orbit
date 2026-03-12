# Orbit App - End-to-End Testing Guide

## 🚀 Quick Start

### Step 1: Verify Server is Running

The server should already be running. Check the logs:
```bash
tail -f /tmp/orbit-server.log
```

You should see:
```
✅ Server listening on http://localhost:4000
✅ [push] APNs configured for iOS push notifications (sandbox)
✅ [scheduler] Scheduler started successfully
```

### Step 2: Start the Mobile App

**Option A: iOS Simulator** (Mac only)
```bash
cd apps/mobile
npm start
# Press 'i' to open iOS Simulator
```

**Option B: Physical iPhone**
```bash
cd apps/mobile
npm start
# Scan QR code with Camera app
# Open in Expo Go
```

---

## 🧪 Test Flow

### Test 1: Authentication (Phone + OTP)

1. **Open the app** - You should see the AuthScreen

2. **Enter phone number**: `+1234567890`
   - Any valid E.164 format works
   - Example: `+14155552671`

3. **Tap "Send Code"**
   - In **dev mode**, the OTP is stubbed
   - Check server logs - you'll see: `[verify] In production, set TWILIO_ACCOUNT_SID...`
   - The OTP is not actually sent (stub mode)

4. **Enter ANY 6-digit code**: `123456`
   - In stub mode, any code works

5. **Enter username**: Your name (e.g., `Myles`)

6. **Tap "Verify"**
   - Should create user in database
   - Should navigate to Home screen

**✅ Success Criteria:**
- No errors
- Navigates to Home screen
- Shows "Welcome" or empty state

---

### Test 2: Create a Group

1. **On Home screen**, tap the **"+"** button (Create Group)

2. **Fill in the form**:
   - **Group Name**: `Test Group`
   - **Call Cadence**: Select `Daily` or `Weekly`
   - **Calls per week** (if weekly): `3`
   - **Call Duration**: `30` minutes

3. **Tap "Create Group"**
   - Should create group in database
   - Should navigate back to Home
   - Should show the new group in the list

**✅ Success Criteria:**
- Group appears in list
- Shows correct name
- Shows cadence (Daily/Weekly)

---

### Test 3: View Group Details

1. **Tap on the group** you just created

2. **You should see**:
   - Group name
   - Cadence info
   - Members list (just you)
   - **"Start Call Now"** button
   - **"View Call History"** section (empty)

**✅ Success Criteria:**
- All info displays correctly
- No errors

---

### Test 4: Start an Immediate Call

1. **On Group Detail screen**, tap **"Start Call Now"**

2. **Grant permissions** (if prompted):
   - Camera access
   - Microphone access

3. **You should see**:
   - Loading indicator
   - Then navigate to Call Screen
   - Your video should appear

4. **Call Screen shows**:
   - Your local video feed
   - Call timer
   - **"Leave Call"** button
   - Participant count

5. **Test Twilio Video**:
   - Your face should be visible
   - Video should be smooth
   - Audio indicator (if sound is enabled)

6. **Tap "Leave Call"**
   - Should end call
   - Navigate back to Group Detail
   - Call should appear in Call History

**✅ Success Criteria:**
- Camera/mic permissions granted
- Video feed appears
- Can leave call successfully
- Call appears in history

---

### Test 5: Join Call with Second Device (Multi-User Test)

**This requires 2 devices or 1 simulator + 1 physical device**

**Device 1 (already in group):**
1. Start a call (see Test 4)
2. Stay on Call Screen

**Device 2:**
1. Go through auth (Test 1) with **different phone number**
2. **You need to join the group** (see Test 6 for invite flow)
3. Once in group, tap the group
4. Should see **"Active Call"** indicator
5. Tap **"Join Call"**
6. Both videos should appear!

**✅ Success Criteria:**
- Both participants see each other
- Both videos streaming
- Call timer matches
- Can both leave independently

---

### Test 6: Invite Flow (Owner Creates Invite)

**Note: The invite UI may not be fully implemented. Here's how to test via API:**

1. **Get your group ID**:
   ```bash
   # In terminal
   sqlite3 apps/server/prisma/dev.db "SELECT id, name FROM Group;"
   ```

2. **Create invite code** (as group owner):
   ```bash
   curl -X POST http://localhost:4000/groups/{GROUP_ID}/invite \
     -H "Authorization: Bearer {YOUR_ACCESS_TOKEN}" \
     -H "Content-Type: application/json"
   ```

   Response:
   ```json
   {
     "invite_code": "ABC12345",
     "expires_at": "2024-11-23T..."
   }
   ```

3. **Share code** with second user

4. **Second user joins**:
   - They would use the invite code in the app (if UI exists)
   - Or via deep link: `orbit://invite/ABC12345`

---

### Test 7: Scheduler (Automated Random Calls)

The scheduler runs automatically and creates random calls for groups.

1. **Check scheduler is running**:
   ```bash
   tail -f /tmp/orbit-server.log | grep scheduler
   ```

   You should see every hour:
   ```
   [scheduler] Generating scheduled calls...
   [scheduler] Generated calls for N groups
   ```

2. **View scheduled calls** in database:
   ```bash
   # Option 1: Prisma Studio (visual)
   cd apps/server
   npx prisma studio
   # Open browser to http://localhost:5555
   # Click "CallSession" table
   # See scheduled calls with status='scheduled'
   ```

   ```bash
   # Option 2: Direct query
   sqlite3 apps/server/prisma/dev.db "
     SELECT id, group_id, status, scheduled_at
     FROM CallSession
     WHERE status = 'scheduled'
     ORDER BY scheduled_at;
   "
   ```

3. **Manually trigger a scheduled call** (for testing):
   - Update a scheduled call to have `scheduled_at = NOW`
   - Wait 1 minute (scheduler checks every minute)
   - Call status should change to `active`
   - Push notifications should be sent

4. **Check push notification logs**:
   ```bash
   tail -f /tmp/orbit-server.log | grep push
   ```

**✅ Success Criteria:**
- Scheduler generates calls every hour
- Scheduled calls have random times
- Daily cadence: 1 call per day
- Weekly cadence: N calls spread across week

---

## 🐛 Troubleshooting

### Issue: "Network request failed"
**Fix**: Update API URL in mobile app

1. Find your computer's local IP:
   ```bash
   ipconfig getifaddr en0  # macOS Wi-Fi
   # or
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

2. Update mobile screens to use your IP:
   - Open each screen file
   - Change `http://localhost:4000` to `http://192.168.1.X:4000`

3. Or use the env variable (already set in `.env`):
   ```
   EXPO_PUBLIC_API_BASE=http://192.168.1.175:4000
   ```

### Issue: "OTP not working"
**Dev Mode**: Any 6-digit code works (123456, 000000, etc.)

**Production Mode** (when Twilio is configured):
- Real SMS will be sent
- Use the actual code received

### Issue: "Camera not working"
1. Check permissions in iOS Settings → Orbit
2. Try rebuilding the app:
   ```bash
   cd apps/mobile
   npm run ios
   ```

### Issue: "Video call black screen"
- Check Twilio credentials are set (or stub mode is working)
- Check camera/mic permissions granted
- Try leaving and rejoining call

### Issue: "Database errors"
**Reset database**:
```bash
cd apps/server
npx prisma migrate reset --force
```

**Re-run migrations**:
```bash
DATABASE_URL="postgresql://postgres:..." npx prisma db push
```

---

## 📊 Monitoring & Debugging

### View Server Logs
```bash
tail -f /tmp/orbit-server.log
```

### View Database (Prisma Studio)
```bash
cd apps/server
npx prisma studio
# Opens http://localhost:5555
```

### Test API Endpoints Directly

**Health Check:**
```bash
curl http://localhost:4000/health
```

**Request OTP:**
```bash
curl -X POST http://localhost:4000/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+14155552671"}'
```

**Verify OTP:**
```bash
curl -X POST http://localhost:4000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+14155552671",
    "code": "123456",
    "username": "TestUser"
  }'
```

---

## ✅ Success Checklist

- [ ] Server starts without errors
- [ ] Mobile app loads
- [ ] Can authenticate with phone + OTP
- [ ] Can create a group
- [ ] Can view group details
- [ ] Can start an immediate call
- [ ] Video feed appears in call
- [ ] Can leave call
- [ ] Call appears in history
- [ ] Scheduler generates scheduled calls
- [ ] Database persists data correctly

---

## 🚀 Next Steps After Testing

1. **Configure real Twilio credentials** for production OTP
2. **Set up Firebase** for Android push notifications
3. **Polish UI/UX** (loading states, error messages)
4. **Add invite flow UI** in mobile app
5. **Implement deep linking** for invite codes
6. **Test on physical devices**
7. **Deploy backend** to production
8. **Build app** for TestFlight/App Store

---

Last Updated: 2024-11-16
