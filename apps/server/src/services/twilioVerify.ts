export const twilioVerify = {
  async requestOtp(phone: string) {
    // Stub: integrate with Twilio Verify
    console.log(`[verify] send OTP to ${phone}`);
  },
  async verifyOtp(_phone: string, _code: string) {
    // Stub always true for dev
    return true;
  }
};

