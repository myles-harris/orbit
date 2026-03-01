// Central API configuration
// Set EXPO_PUBLIC_API_BASE in your .env file:
//   Simulator: http://localhost:4000
//   Physical device: http://<your-machine-LAN-ip>:4000
export const API_URL =
  process.env.EXPO_PUBLIC_API_BASE?.replace(/\/$/, '') ?? 'http://localhost:4000';
