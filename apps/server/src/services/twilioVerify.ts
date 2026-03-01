import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

// Initialize Twilio client only if credentials are provided
let twilioClient: ReturnType<typeof twilio> | null = null;

if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
}

export const twilioVerify = {
  async requestOtp(phone: string) {
    // If Twilio not configured, use stub for development
    if (!twilioClient || !verifySid) {
      console.log(`[verify] STUB: send OTP to ${phone} (Twilio not configured)`);
      console.log(`[verify] In production, set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID`);
      return;
    }

    try {
      const verification = await twilioClient.verify.v2
        .services(verifySid)
        .verifications.create({
          to: phone,
          channel: 'sms'
        });

      console.log(`[verify] OTP sent to ${phone}, status: ${verification.status}`);
    } catch (error) {
      console.error(`[verify] Failed to send OTP to ${phone}:`, error);
      throw new Error('Failed to send verification code');
    }
  },

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    // If Twilio not configured, use stub for development
    if (!twilioClient || !verifySid) {
      console.log(`[verify] STUB: verifying OTP for ${phone} with code ${code} (Twilio not configured)`);
      console.log(`[verify] Accepting any code in development mode`);
      // In dev mode, accept code "123456" or any 6-digit code
      return /^\d{6}$/.test(code);
    }

    try {
      const verificationCheck = await twilioClient.verify.v2
        .services(verifySid)
        .verificationChecks.create({
          to: phone,
          code: code
        });

      const isValid = verificationCheck.status === 'approved';
      console.log(`[verify] OTP verification for ${phone}: ${isValid ? 'SUCCESS' : 'FAILED'}`);
      return isValid;
    } catch (error) {
      console.error(`[verify] Failed to verify OTP for ${phone}:`, error);
      return false;
    }
  }
};
