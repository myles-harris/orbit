# Apple Push Notification Service (APNs) Setup Guide for Orbit

This guide walks you through configuring APNs for your Orbit iOS app.

## Prerequisites

- ✅ Apple Developer Program membership (active)
- Bundle ID: `com.orbit.app` (already configured in [app.json](apps/mobile/app.json#L11))

---

## Part 1: Apple Developer Portal Setup

### Step 1: Create an APNs Auth Key

1. Go to [Apple Developer Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/authkeys/list)
2. Click the **"+"** button to create a new key
3. Configure the key:
   - **Key Name**: `Orbit APNs Key` (or any descriptive name)
   - **Enable**: Check "Apple Push Notifications service (APNs)"
4. Click **"Continue"**, then **"Register"**
5. **Download the key** (.p8 file) - **IMPORTANT: You can only download this once!**
6. Note the following values (you'll need them):
   - **Key ID**: (e.g., `ABC123DEFG`)
   - **Team ID**: Found in the top-right corner or at [Membership page](https://developer.apple.com/account#!/membership/)

### Step 2: Register App ID with Push Notifications

1. Go to [Identifiers](https://developer.apple.com/account/resources/identifiers/list)
2. Find or create identifier for `com.orbit.app`
3. If creating new:
   - Click **"+"** button
   - Select **"App IDs"**, click **"Continue"**
   - Select **"App"**, click **"Continue"**
   - **Description**: `Orbit App`
   - **Bundle ID**: Select "Explicit" and enter `com.orbit.app`
   - **Capabilities**: Check "Push Notifications"
   - Click **"Continue"**, then **"Register"**
4. If identifier exists:
   - Select `com.orbit.app` from the list
   - Ensure **"Push Notifications"** is checked in Capabilities
   - Click **"Save"**

---

## Part 2: Server Configuration

### Step 1: Store the APNs Key File

1. Create a secure directory for credentials:
   ```bash
   mkdir -p apps/server/credentials
   ```

2. Move your downloaded `.p8` file to this directory:
   ```bash
   mv ~/Downloads/AuthKey_ABC123DEFG.p8 apps/server/credentials/
   ```

3. Secure the file permissions:
   ```bash
   chmod 600 apps/server/credentials/AuthKey_*.p8
   ```

4. **Add to .gitignore** (already done - verify `credentials/` is listed)

### Step 2: Configure Environment Variables

Add these to your `apps/server/.env` file:

```bash
# APNs Configuration
APNS_KEY_ID=ABC123DEFG                                    # Replace with your Key ID
APNS_TEAM_ID=XYZ9876543                                   # Replace with your Team ID
APNS_KEY_PATH=./credentials/AuthKey_ABC123DEFG.p8         # Path to your .p8 file
APNS_BUNDLE_ID=com.orbit.app                              # Your app's bundle ID
APNS_PRODUCTION=false                                      # Use 'true' for production, 'false' for sandbox/development
```

**Important Notes:**
- Use `APNS_PRODUCTION=false` for development builds and TestFlight
- Use `APNS_PRODUCTION=true` only for App Store production builds
- The server code at [notifications.ts](apps/server/src/services/notifications.ts) is already configured to use these environment variables

---

## Part 3: Mobile App Configuration

### Step 1: Update app.json for Push Notifications

Your [app.json](apps/mobile/app.json) needs push notification configuration:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.orbit.app",
      "infoPlist": {
        "NSCameraUsageDescription": "Orbit needs camera access for video calls",
        "NSMicrophoneUsageDescription": "Orbit needs microphone access for video calls"
      }
    },
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#ffffff",
          "sounds": ["./assets/notification-sound.wav"]
        }
      ]
    ]
  }
}
```

### Step 2: Install Expo Notifications

```bash
cd apps/mobile
npx expo install expo-notifications expo-device expo-constants
```

### Step 3: Request Push Notification Permissions

The mobile app needs to request permissions and register for push notifications. This should be added to your app initialization (typically in `App.tsx` or a dedicated service).

---

## Part 4: Testing APNs

### Test in Development Mode

1. Start your server with APNs configured:
   ```bash
   cd apps/server
   npm run dev
   ```

2. You should see in the logs:
   ```
   [push] APNs configured for iOS push notifications (sandbox)
   ```

3. Run your iOS app:
   ```bash
   cd apps/mobile
   npx expo run:ios
   ```

4. Test sending a notification through your app (e.g., trigger a call notification)

### Verify Configuration

Check that the server logs show successful APNs initialization:
- ✅ `[push] APNs configured for iOS push notifications (sandbox)`
- ❌ `[push] APNs credentials not set - iOS push notifications will be stubbed`

---

## Part 5: Production Deployment Checklist

Before deploying to production:

- [ ] Store APNs key securely on production server
- [ ] Set `APNS_PRODUCTION=true` in production environment
- [ ] Verify production bundle ID matches exactly: `com.orbit.app`
- [ ] Test with TestFlight build first (uses sandbox APNs)
- [ ] Test with App Store build for final verification (uses production APNs)
- [ ] Monitor server logs for APNs errors
- [ ] Set up error tracking for failed notifications

---

## Troubleshooting

### "APNs credentials not set" message
- Verify all environment variables are set correctly
- Check that the `.p8` file path is correct and accessible
- Ensure file permissions allow the server to read the key file

### Push notifications not arriving
- Verify `APNS_PRODUCTION` matches your build type:
  - Development/TestFlight = `false` (sandbox)
  - App Store = `true` (production)
- Check device token is being registered correctly
- Verify bundle ID matches exactly in all configs
- Check server logs for APNs errors

### "Invalid token" errors
- Ensure device tokens are being collected for the correct environment
- Tokens from sandbox builds won't work with production APNs and vice versa

### Certificate vs Auth Key
- This setup uses **Auth Keys** (token-based, .p8 files) - the modern approach
- Auth Keys never expire and work for all your apps
- If you need certificate-based auth (.p12), you'll need to modify the server code

---

## Current Implementation Status

Your server is already configured to handle APNs at [notifications.ts](apps/server/src/services/notifications.ts#L30-L53):
- ✅ APNs provider initialization
- ✅ Token-based authentication (.p8 key)
- ✅ Sandbox/production environment switching
- ✅ Batch notification sending
- ✅ Error handling and logging

You just need to:
1. Add the credentials to your Apple Developer account
2. Download and store the .p8 key file
3. Configure the environment variables
4. Update the mobile app to register for push notifications

---

## Next Steps

After completing this guide:
1. Test push notifications in development
2. Set up push notification handling in the mobile app
3. Configure notification UI/UX
4. Test with TestFlight before production release
5. Monitor APNs metrics in Apple Developer portal

## Resources

- [Apple Push Notification Service Documentation](https://developer.apple.com/documentation/usernotifications)
- [Expo Push Notifications Guide](https://docs.expo.dev/push-notifications/overview/)
- [node-apn Documentation](https://github.com/node-apn/node-apn)