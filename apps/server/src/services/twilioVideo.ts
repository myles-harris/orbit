import jwt from 'jsonwebtoken';
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKeySid = process.env.TWILIO_API_KEY_SID;
const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;

export const twilioVideo = {
  createParticipantToken(userId: string, roomName: string): string {
    // If Twilio not configured, return a stub token for development
    if (!accountSid || !apiKeySid || !apiKeySecret) {
      console.log(`[video] STUB: creating token for user ${userId} in room ${roomName} (Twilio not configured)`);
      console.log(`[video] In production, set TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, and TWILIO_API_KEY_SECRET`);

      // Return a dev token that can be used for testing (not valid for actual Twilio)
      const payload = { userId, room: roomName, stub: true };
      return jwt.sign(payload, process.env.JWT_SECRET || 'dev_secret', { expiresIn: 3600 });
    }

    // Create a Twilio Video Access Token
    const AccessToken = twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    // Create an access token
    const token = new AccessToken(
      accountSid,
      apiKeySid,
      apiKeySecret,
      {
        identity: userId,
        ttl: 3600 // 1 hour
      }
    );

    // Create a video grant for this token
    const videoGrant = new VideoGrant({
      room: roomName
    });

    // Add the grant to the token
    token.addGrant(videoGrant);

    // Serialize the token to a JWT string
    const jwtToken = token.toJwt();

    console.log(`[video] Created Twilio Video token for user ${userId} in room ${roomName}`);
    return jwtToken;
  },

  /**
   * Create or retrieve a Twilio Video Room
   * Returns the room's unique SID
   */
  async createRoom(roomName: string): Promise<string> {
    if (!accountSid || !apiKeySid || !apiKeySecret) {
      console.log(`[video] STUB: creating room ${roomName} (Twilio not configured)`);
      return `STUB_ROOM_${roomName}`;
    }

    try {
      const client = twilio(apiKeySid, apiKeySecret, { accountSid });

      // Try to create the room (or get existing if already exists)
      const room = await client.video.v1.rooms.create({
        uniqueName: roomName,
        type: 'group', // 'group' supports up to 50 participants
        maxParticipants: 10 // As per PRD
      });

      console.log(`[video] Created room ${roomName}, SID: ${room.sid}`);
      return room.sid;
    } catch (error: any) {
      // If room already exists, fetch it
      if (error.code === 53113) {
        const client = twilio(apiKeySid, apiKeySecret, { accountSid });
        const rooms = await client.video.v1.rooms.list({ uniqueName: roomName, limit: 1 });

        if (rooms.length > 0) {
          console.log(`[video] Room ${roomName} already exists, SID: ${rooms[0].sid}`);
          return rooms[0].sid;
        }
      }

      console.error(`[video] Failed to create room ${roomName}:`, error);
      throw new Error('Failed to create video room');
    }
  },

  /**
   * Close a Twilio Video Room
   */
  async closeRoom(roomSid: string): Promise<void> {
    if (!accountSid || !apiKeySid || !apiKeySecret) {
      console.log(`[video] STUB: closing room ${roomSid} (Twilio not configured)`);
      return;
    }

    try {
      const client = twilio(apiKeySid, apiKeySecret, { accountSid });

      await client.video.v1.rooms(roomSid).update({ status: 'completed' });

      console.log(`[video] Closed room ${roomSid}`);
    } catch (error) {
      console.error(`[video] Failed to close room ${roomSid}:`, error);
      throw new Error('Failed to close video room');
    }
  }
};
