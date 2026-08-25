import './util/loadDotenv.js';
import { validateEnv } from './util/env.js';
import { app } from './app.js';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { timingSafeEqual } from 'node:crypto';
import { schedulerQueue } from './queue/schedulerQueue.js';
import { stopSchedulerWorker } from './worker/scheduler.js';
import { prisma } from './db/prisma.js';

validateEnv();

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  process.exit(1);
});

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(schedulerQueue)],
  serverAdapter,
});

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

app.use('/admin/queues', (req, res, next) => {
  if (!ADMIN_TOKEN) {
    console.error('[admin] ADMIN_TOKEN is not set — /admin/queues is disabled');
    return res.status(503).json({ error: 'admin_disabled' });
  }
  const token = req.headers['x-admin-token'];
  if (typeof token !== 'string') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Compare byte length, not JS string .length (UTF-16 code units) — a multi-byte
  // header value can match ADMIN_TOKEN's .length while differing in Buffer length,
  // which would make timingSafeEqual throw a RangeError instead of returning false.
  const tokenBuf = Buffer.from(token);
  const adminTokenBuf = Buffer.from(ADMIN_TOKEN);
  if (tokenBuf.length !== adminTokenBuf.length || !timingSafeEqual(tokenBuf, adminTokenBuf)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}, serverAdapter.getRouter());

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received, draining...`);
  const timer = setTimeout(() => {
    console.error('[shutdown] Drain timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  try {
    // Actually wait for in-flight requests to finish before tearing down Prisma/
    // BullMQ — server.close() only stops accepting new connections, its callback
    // is what signals every existing connection has closed.
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    console.log('[shutdown] HTTP server closed');
    await stopSchedulerWorker();
    await schedulerQueue.close();
    await prisma.$disconnect();
  } catch (err) {
    console.error('[shutdown] Error during drain:', err);
  }
  clearTimeout(timer);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
