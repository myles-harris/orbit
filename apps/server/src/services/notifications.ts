import { config } from 'dotenv';
config({ override: true });

import apn from 'apn';
import twilio from 'twilio';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

type Platform = 'ios' | 'android';

// Initialize Firebase Admin SDK via service account
let firebaseApp: admin.app.App | null = null;

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (serviceAccountPath) {
  try {
    const serviceAccount = JSON.parse(
      readFileSync(resolve(process.cwd(), serviceAccountPath), 'utf-8')
    );
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[push] Firebase Admin SDK configured for Android push notifications');
  } catch (error) {
    console.error('[push] Failed to initialize Firebase Admin SDK:', error);
  }
} else {
  console.log('[push] GOOGLE_APPLICATION_CREDENTIALS not set - Android push notifications will be stubbed');
}

// Initialize APNs
let apnProvider: apn.Provider | null = null;
const apnsKeyId = process.env.APNS_KEY_ID;
const apnsTeamId = process.env.APNS_TEAM_ID;
const apnsKeyPath = process.env.APNS_KEY_PATH;
const apnsProduction = process.env.APNS_PRODUCTION === 'true';

if (apnsKeyId && apnsTeamId && apnsKeyPath) {
  try {
    apnProvider = new apn.Provider({
      token: {
        key: apnsKeyPath,
        keyId: apnsKeyId,
        teamId: apnsTeamId
      },
      production: apnsProduction
    });
    console.log(`[push] APNs configured for iOS push notifications (${apnsProduction ? 'production' : 'sandbox'})`);
  } catch (error) {
    console.error('[push] Failed to initialize APNs:', error);
  }
} else {
  console.log('[push] APNs credentials not set - iOS push notifications will be stubbed');
}

// Initialize Twilio for SMS fallback
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
let twilioClient: ReturnType<typeof twilio> | null = null;

if (twilioAccountSid && twilioAuthToken) {
  twilioClient = twilio(twilioAccountSid, twilioAuthToken);
  console.log('[sms] Twilio configured for SMS notifications');
} else {
  console.log('[sms] Twilio not configured - SMS fallback will be stubbed');
}

export const notifications = {
  /**
   * Send push notifications to multiple devices
   */
  async sendPushTokens(
    tokens: { token: string; platform: Platform }[],
    title: string,
    body: string,
    data?: Record<string, string>
  ) {
    const results = { success: 0, failure: 0 };

    // Group tokens by platform
    const iosTokens = tokens.filter(t => t.platform === 'ios').map(t => t.token);
    const androidTokens = tokens.filter(t => t.platform === 'android').map(t => t.token);

    // Send to iOS devices
    if (iosTokens.length > 0) {
      const iosResults = await this.sendApns(iosTokens, title, body, data);
      results.success += iosResults.success;
      results.failure += iosResults.failure;
    }

    // Send to Android devices
    if (androidTokens.length > 0) {
      const androidResults = await this.sendFcm(androidTokens, title, body, data);
      results.success += androidResults.success;
      results.failure += androidResults.failure;
    }

    console.log(`[push] Sent notifications: ${results.success} succeeded, ${results.failure} failed`);
    return results;
  },

  /**
   * Send push notification via APNs (iOS)
   */
  async sendApns(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>
  ) {
    if (!apnProvider) {
      console.log(`[push] STUB: Would send APNs to ${tokens.length} iOS devices: ${title} - ${body}`);
      return { success: tokens.length, failure: 0 };
    }

    const results = { success: 0, failure: 0 };

    const notification = new apn.Notification({
      alert: {
        title,
        body
      },
      sound: 'default',
      badge: 1,
      topic: process.env.APNS_BUNDLE_ID || 'com.orbit.app',
      payload: data || {}
    });

    for (const token of tokens) {
      try {
        const result = await apnProvider.send(notification, token);

        if (result.failed.length > 0) {
          console.error(`[push] APNs failed for token ${token}:`, result.failed[0].response);
          results.failure++;
        } else {
          results.success++;
        }
      } catch (error) {
        console.error(`[push] APNs error for token ${token}:`, error);
        results.failure++;
      }
    }

    return results;
  },

  /**
   * Send push notification via FCM (Android) using Firebase Admin SDK
   */
  async sendFcm(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>
  ) {
    if (!firebaseApp) {
      console.log(`[push] STUB: Would send FCM to ${tokens.length} Android devices: ${title} - ${body}`);
      return { success: tokens.length, failure: 0 };
    }

    const results = { success: 0, failure: 0 };

    for (const token of tokens) {
      try {
        await admin.messaging(firebaseApp).send({
          token,
          notification: { title, body },
          data: data || {},
          android: {
            priority: 'high',
            notification: { sound: 'default' }
          }
        });
        results.success++;
      } catch (error) {
        console.error(`[push] FCM error for token ${token}:`, error);
        results.failure++;
      }
    }

    return results;
  },

  /**
   * Send SMS notifications (fallback)
   */
  async sendSms(phones: string[], message: string) {
    if (!twilioClient) {
      console.log(`[sms] STUB: Would send SMS to ${phones.length} numbers: ${message}`);
      return;
    }

    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!fromNumber) {
      console.error('[sms] TWILIO_PHONE_NUMBER not configured');
      return;
    }

    for (const phone of phones) {
      try {
        await twilioClient.messages.create({
          body: message,
          from: fromNumber,
          to: phone
        });
        console.log(`[sms] Sent SMS to ${phone}`);
      } catch (error) {
        console.error(`[sms] Failed to send SMS to ${phone}:`, error);
      }
    }
  }
};
