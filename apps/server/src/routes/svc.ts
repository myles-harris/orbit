import { Router } from 'express';

export const svcRouter = Router();

// Worker roll-over to generate future schedules
svcRouter.post('/schedule/rollover', async (_req, res) => {
  res.json({ status: 'ok' });
});

// Trigger a scheduled call (internal)
svcRouter.post('/schedule/trigger', async (_req, res) => {
  res.json({ status: 'triggered' });
});

// Force-close a room
svcRouter.post('/calls/:id/close', async (req, res) => {
  res.json({ id: req.params.id, status: 'closed' });
});

