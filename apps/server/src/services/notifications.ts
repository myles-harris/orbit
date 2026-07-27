import { config } from 'dotenv';
config();

import twilio from 'twilio';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { prisma } from '../db/prisma.js';
import { sendApnsRaw, isApnsConfigured, BUNDLE } from './apns.js';

type Platform = 'ios' | 'android';

export interface PushOptions {
  sound?: boolean;
  vibrate?: boolean;
  breakFocus?: boolean;
}

export function callChannelId(o: PushOptions): string {
  return [
    'calls',
    o.sound !== false ? 'sound' : 'silent',
    o.vibrate !== false ? 'vibrate' : 'novibrate',
    o.breakFocus ? 'dnd' : 'nodnd',
  ].join('-');
}

// Initialize Firebase Admin SDK via service account
let firebaseApp: admin.app.App | null = null;

const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (serviceAccountJson) {
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[push] Firebase Admin SDK configured for Android push notifications');
  } catch (error) {
    console.error('[push] Failed to initialize Firebase Admin SDK:', error);
  }
} else if (serviceAccountPath) {
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

// Log APNs configuration state on startup.
const apnsProduction = process.env.APNS_PRODUCTION === 'true';
if (isApnsConfigured()) {
  console.log(`[push] APNs configured for iOS push notifications (${apnsProduction ? 'production' : 'sandbox'})`);
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

/** Content-state shape must match the Swift Codable property names exactly. */
export interface CallLiveActivityState {
  groupName: string;
  callType: 'scheduled' | 'spontaneous';
  endsAtMs?: number;
}

export const notifications = {
  /**
   * Send push notifications to multiple devices with per-user preference options.
   */
  async sendPushTokens(
    tokens: { token: string; platform: Platform }[],
    title: string,
    body: string,
    data?: Record<string, string>,
    opts: PushOptions = {},
  ) {
    const results = { success: 0, failure: 0 };

    const expoTokens = tokens.filter(t => t.token.startsWith('ExponentPushToken[')).map(t => t.token);
    const nativeTokens = tokens.filter(t => !t.token.startsWith('ExponentPushToken['));

    if (expoTokens.length > 0) {
      const expoResults = await this.sendExpo(expoTokens, title, body, data, opts);
      results.success += expoResults.success;
      results.failure += expoResults.failure;
    }

    if (nativeTokens.length > 0) {
      const iosTokens = nativeTokens.filter(t => t.platform === 'ios').map(t => t.token);
      const androidTokens = nativeTokens.filter(t => t.platform === 'android').map(t => t.token);

      if (iosTokens.length > 0) {
        const iosResults = await this.sendApns(iosTokens, title, body, data, opts);
        results.success += iosResults.success;
        results.failure += iosResults.failure;
      }

      if (androidTokens.length > 0) {
        const androidResults = await this.sendFcm(androidTokens, title, body, data, opts);
        results.success += androidResults.success;
        results.failure += androidResults.failure;
      }
    }

    console.log(`[push] Sent notifications: ${results.success} succeeded, ${results.failure} failed`);
    return results;
  },

  /**
   * Send push notification via Expo Push Notification service
   */
  async sendExpo(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
    opts: PushOptions = {},
  ) {
    const results = { success: 0, failure: 0 };

    try {
      const channelId = callChannelId(opts);
      const messages = tokens.map(token => ({
        to: token,
        sound: opts.sound !== false ? 'default' : undefined,
        title,
        body,
        data: { ...(data || {}), channelId },
        channelId,
      }));

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const result = await response.json();

      if (result.data) {
        for (const receipt of result.data) {
          if (receipt.status === 'ok') {
            results.success++;
          } else {
            console.error(`[push] Expo push failed:`, receipt);
            results.failure++;
          }
        }
      }

      console.log(`[push] Expo: sent to ${tokens.length} tokens, ${results.success} succeeded, ${results.failure} failed`);
    } catch (error) {
      console.error(`[push] Expo push error:`, error);
      results.failure = tokens.length;
    }

    return results;
  },

  /**
   * Send push notification via APNs (iOS) using HTTP/2 direct sender.
   */
  async sendApns(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
    opts: PushOptions = {},
  ) {
    if (!isApnsConfigured()) {
      console.log(`[push] STUB: Would send APNs to ${tokens.length} iOS devices: ${title} - ${body}`);
      return { success: 0, failure: tokens.length };
    }

    const results = { success: 0, failure: 0 };
    const staleTokens: string[] = [];

    const payload = {
      aps: {
        alert: { title, body },
        sound: opts.sound !== false ? 'default' : undefined,
        badge: 1,
        'interruption-level': opts.breakFocus ? 'time-sensitive' : 'active',
        'relevance-score': 1.0,
      },
      ...(data || {}),
    };

    for (const token of tokens) {
      const result = await sendApnsRaw(token, payload, { pushType: 'alert', priority: 10 });
      if (result.ok) {
        results.success++;
      } else {
        console.error(`[push] APNs failed for token ${token.slice(0, 12)}…: ${result.reason} (${result.status})`);
        if (result.reason === 'BadDeviceToken' || result.reason === 'Unregistered') {
          staleTokens.push(token);
        }
        results.failure++;
      }
    }

    if (staleTokens.length > 0) {
      console.log(`[push] Removing ${staleTokens.length} stale APNs token(s) from DB`);
      await prisma.pushDevice.deleteMany({ where: { token: { in: staleTokens } } });
    }

    return results;
  },

  /**
   * Send push notification via FCM (Android) using Firebase Admin SDK.
   *
   * Sends a data-only message (no `notification` key) so the client app handles
   * presentation and can choose the correct channel. A `notification` key is also
   * included as a tray fallback for devices still running an old binary that hasn't
   * gained the client-side presentation logic yet.
   */
  async sendFcm(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
    opts: PushOptions = {},
  ) {
    if (!firebaseApp) {
      console.log(`[push] STUB: Would send FCM to ${tokens.length} Android devices: ${title} - ${body}`);
      return { success: 0, failure: tokens.length };
    }

    const results = { success: 0, failure: 0 };
    const staleTokens: string[] = [];
    const channelId = callChannelId(opts);

    for (const token of tokens) {
      try {
        await admin.messaging(firebaseApp).send({
          token,
          // Tray fallback for old builds; new builds present from the data payload.
          notification: { title, body },
          data: {
            ...(data || {}),
            title,
            body,
            channelId,
            sound: String(opts.sound !== false),
            vibrate: String(opts.vibrate !== false),
          },
          android: {
            priority: 'high',
          },
        });
        results.success++;
      } catch (error: any) {
        console.error(`[push] FCM error for token ${token.slice(0, 12)}…:`, error?.code ?? error);
        const staleErrorCodes = [
          'messaging/registration-token-not-registered',
          'messaging/invalid-registration-token',
        ];
        if (staleErrorCodes.includes(error?.code)) {
          staleTokens.push(token);
        }
        results.failure++;
      }
    }

    if (staleTokens.length > 0) {
      console.log(`[push] Removing ${staleTokens.length} stale FCM token(s) from DB`);
      await prisma.pushDevice.deleteMany({ where: { token: { in: staleTokens } } });
    }

    return results;
  },

  /**
   * Send push notifications to a group's members, bucketed by per-user preferences
   * so each bucket gets the correct sound, vibration, and focus settings.
   */
  async sendToBuckets(
    members: Array<{
      is_muted: boolean;
      user: {
        notify_sound: boolean;
        notify_vibrate: boolean;
        notify_break_focus: boolean;
        devices: Array<{ token: string; platform: string }>;
      };
    }>,
    title: string,
    body: string,
    data: Record<string, string>,
  ) {
    type Bucket = { opts: PushOptions; tokens: { token: string; platform: Platform }[] };
    const buckets = new Map<string, Bucket>();

    for (const m of members) {
      if (m.is_muted) continue;
      const opts: PushOptions = {
        sound: m.user.notify_sound,
        vibrate: m.user.notify_vibrate,
        breakFocus: m.user.notify_break_focus,
      };
      const key = `${opts.sound}:${opts.vibrate}:${opts.breakFocus}`;
      if (!buckets.has(key)) buckets.set(key, { opts, tokens: [] });
      for (const d of m.user.devices) {
        buckets.get(key)!.tokens.push({ token: d.token, platform: d.platform as Platform });
      }
    }

    const results = { success: 0, failure: 0 };
    for (const b of buckets.values()) {
      if (!b.tokens.length) continue;
      const r = await this.sendPushTokens(b.tokens, title, body, {
        ...data,
        sound: String(b.opts.sound !== false),
        vibrate: String(b.opts.vibrate !== false),
      }, b.opts);
      results.success += r.success;
      results.failure += r.failure;
    }
    return results;
  },

  /**
   * Start a Live Activity on locked/killed iOS devices via push-to-start.
   * Requires iOS 17.2+ and a stored push-to-start token.
   */
  async startLiveActivities(
    ptsTokens: string[],
    attributes: { callId: string; groupId: string },
    state: CallLiveActivityState,
    staleAt?: Date,
  ) {
    if (!isApnsConfigured()) {
      console.log(`[push] STUB: Would send Live Activity start push to ${ptsTokens.length} device(s)`);
      return;
    }

    const payload = {
      aps: {
        timestamp: Math.floor(Date.now() / 1000),
        event: 'start',
        'content-state': state,
        'attributes-type': 'CallActivityAttributes',
        attributes,
        ...(staleAt ? { 'stale-date': Math.floor(staleAt.getTime() / 1000) } : {}),
      },
    };

    for (const token of ptsTokens) {
      const r = await sendApnsRaw(token, payload, {
        pushType: 'liveactivity',
        topic: `${BUNDLE}.push-type.liveactivity`,
        priority: 10,
      });
      if (!r.ok) {
        console.error(`[push] Live Activity start push failed (${r.status}): ${r.reason}`);
      }
    }
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
