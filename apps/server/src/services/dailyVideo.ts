const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_DOMAIN = process.env.DAILY_DOMAIN || 'orbit-calls.daily.co';

// Prefix non-production room names so staging/dev rooms are identifiable in the Daily.co dashboard
const ROOM_ENV_PREFIX = process.env.NODE_ENV === 'production' ? '' : `${process.env.NODE_ENV || 'dev'}-`;

/**
 * Build a Daily.co room name for a call, scoped by environment.
 * Staging rooms appear as e.g. "staging-<groupId>_<timestamp>" in the dashboard.
 */
export function buildRoomName(groupId: string, date: Date): string {
  return `${ROOM_ENV_PREFIX}${groupId}_${date.toISOString().replace(/[:.]/g, '-')}`;
}

interface DailyRoomProperties {
  max_participants?: number;
  enable_screenshare?: boolean;
  enable_chat?: boolean;
  enable_knocking?: boolean;
  enable_prejoin_ui?: boolean;
  exp?: number; // Unix timestamp when room should expire
}

export const dailyVideo = {
  /**
   * Create a Daily.co room
   * Returns the room URL
   */
  async createRoom(roomName: string, expiresAt?: Date): Promise<string> {
    if (!DAILY_API_KEY) {
      console.log(`[daily] STUB: creating room ${roomName} (Daily.co not configured)`);
      console.log(`[daily] In production, set DAILY_API_KEY and DAILY_DOMAIN`);
      return `https://${DAILY_DOMAIN}/${roomName}`;
    }

    try {
      const properties: DailyRoomProperties = {
        max_participants: 10, // As per PRD
        enable_screenshare: true,
        enable_chat: false,
        enable_knocking: false,
        enable_prejoin_ui: false,
      };

      // Set room expiration if provided
      if (expiresAt) {
        properties.exp = Math.floor(expiresAt.getTime() / 1000);
      }

      const response = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DAILY_API_KEY}`,
        },
        body: JSON.stringify({
          name: roomName,
          privacy: 'private', // Requires token to join
          properties,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // Retry-safe: if the room already exists (e.g. a previous activation attempt
        // created it before failing), fetch and reuse it instead of failing forever.
        if (response.status === 400 && errorText.includes('already exists')) {
          const existing = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
            headers: { 'Authorization': `Bearer ${DAILY_API_KEY}` },
          });
          if (existing.ok) {
            const room = await existing.json();
            console.log(`[daily] Room ${roomName} already existed — reusing ${room.url}`);
            return room.url;
          }
        }

        throw new Error(`Daily API error: ${response.status} ${errorText}`);
      }

      const room = await response.json();
      console.log(`[daily] Created room ${roomName}, URL: ${room.url}`);
      return room.url;
    } catch (error: any) {
      console.error(`[daily] Failed to create room ${roomName}:`, error);
      throw new Error('Failed to create video room');
    }
  },

  /**
   * Create a meeting token for a participant to join a room
   */
  async createMeetingToken(roomName: string, userId: string, expiresAt?: Date): Promise<string> {
    if (!DAILY_API_KEY) {
      console.log(`[daily] STUB: creating token for user ${userId} in room ${roomName} (Daily.co not configured)`);
      // Return a stub token for development
      return `stub_token_${userId}_${roomName}`;
    }

    try {
      const properties: any = {
        room_name: roomName,
        user_id: userId,
        user_name: userId,
        enable_screenshare: true,
        start_video_off: false,
        start_audio_off: false,
      };

      // Set token expiration if provided
      if (expiresAt) {
        properties.exp = Math.floor(expiresAt.getTime() / 1000);
      }

      const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DAILY_API_KEY}`,
        },
        body: JSON.stringify({
          properties,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Daily API error: ${response.status} ${error}`);
      }

      const result = await response.json();
      console.log(`[daily] Created meeting token for user ${userId} in room ${roomName}`);
      return result.token;
    } catch (error: any) {
      console.error(`[daily] Failed to create meeting token:`, error);
      throw new Error('Failed to create meeting token');
    }
  },

  /**
   * Check whether a Daily.co room currently exists
   */
  async roomExists(roomName: string): Promise<boolean> {
    if (!DAILY_API_KEY) {
      // Stub mode: rooms are never actually created
      return false;
    }

    try {
      const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
        headers: {
          'Authorization': `Bearer ${DAILY_API_KEY}`,
        },
      });
      return response.ok;
    } catch (error) {
      console.error(`[daily] Failed to check room existence for ${roomName}:`, error);
      return false;
    }
  },

  /**
   * Number of participants currently connected to a room, per Daily's presence API.
   * Returns null when presence can't be determined (room missing, API error, stub mode)
   * so callers can distinguish "empty" from "unknown".
   */
  async getRoomPresenceCount(roomName: string): Promise<number | null> {
    if (!DAILY_API_KEY) return null;

    try {
      const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}/presence`, {
        headers: { 'Authorization': `Bearer ${DAILY_API_KEY}` },
      });
      if (!response.ok) return null;
      const data = await response.json();
      return typeof data.total_count === 'number' ? data.total_count : null;
    } catch (error) {
      console.error(`[daily] Presence check failed for ${roomName}:`, error);
      return null;
    }
  },

  /**
   * Delete a Daily.co room
   */
  async deleteRoom(roomName: string): Promise<void> {
    if (!DAILY_API_KEY) {
      console.log(`[daily] STUB: deleting room ${roomName} (Daily.co not configured)`);
      return;
    }

    try {
      const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${DAILY_API_KEY}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        const error = await response.text();
        throw new Error(`Daily API error: ${response.status} ${error}`);
      }

      console.log(`[daily] Deleted room ${roomName}`);
    } catch (error: any) {
      console.error(`[daily] Failed to delete room ${roomName}:`, error);
      throw new Error('Failed to delete video room');
    }
  },
};