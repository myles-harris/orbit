// Simple in-process scheduler stub. In production, use a durable scheduler (e.g., cron + queue/EventBridge)

const enabled = (process.env.SCHEDULER_ENABLED || 'true') === 'true';

export function startScheduler() {
  if (!enabled) return;
  setInterval(() => {
    // 1) roll over future random call sessions if needed
    // 2) activate any due sessions, dispatch notifications
    // 3) close expired active sessions
    // Stub: log heartbeat
    const now = new Date().toISOString();
    console.log(`[scheduler] tick ${now}`);
  }, 60_000);
}

if (require.main === module) {
  startScheduler();
}

