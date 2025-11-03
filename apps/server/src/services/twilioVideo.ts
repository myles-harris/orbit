import jwt from 'jsonwebtoken';

export const twilioVideo = {
  createParticipantToken(userId: string, roomName: string) {
    // Minimal JWT for Twilio style; replace with Twilio AccessToken in prod
    const payload = { userId, room: roomName };
    const token = jwt.sign(payload, process.env.TWILIO_API_KEY_SECRET || 'dev_twilio', { expiresIn: 3600 });
    return token;
  }
};

