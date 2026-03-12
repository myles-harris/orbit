// Scheduler worker for managing call sessions
// In production, consider using a robust job queue (Bull, BullMQ) or cloud scheduler (AWS EventBridge, GCP Cloud Scheduler)

import { scheduler } from '../services/scheduler.js';

const enabled = (process.env.SCHEDULER_ENABLED || 'true') === 'true';

export function startScheduler() {
  if (!enabled) {
    console.log('[scheduler] Scheduler disabled via SCHEDULER_ENABLED env var');
    return;
  }

  console.log('[scheduler] Starting scheduler...');

  // Generate scheduled calls for the next period (run daily at midnight)
  // For now, run every hour to ensure calls are scheduled
  setInterval(async () => {
    try {
      await scheduler.generateScheduledCalls();
    } catch (error) {
      console.error('[scheduler] Error generating scheduled calls:', error);
    }
  }, 60 * 60 * 1000); // Every hour

  // Run once on startup
  scheduler.generateScheduledCalls().catch(console.error);

  // Check for calls that should be activated (run every minute)
  setInterval(async () => {
    try {
      await scheduler.activateDueCalls();
    } catch (error) {
      console.error('[scheduler] Error activating calls:', error);
    }
  }, 60 * 1000); // Every minute

  // Check for calls that should be closed (run every 10 seconds)
  setInterval(async () => {
    try {
      await scheduler.closeExpiredCalls();
    } catch (error) {
      console.error('[scheduler] Error closing expired calls:', error);
    }
  }, 10 * 1000); // Every 10 seconds

  console.log('[scheduler] Scheduler started successfully');
}

// Allow running as standalone process (ES module check)
// When run directly: node scheduler.js or tsx scheduler.ts
// When imported: this won't execute
if (import.meta.url === `file://${process.argv[1]}`) {
  startScheduler();

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('[scheduler] Shutting down...');
    process.exit(0);
  });
}
