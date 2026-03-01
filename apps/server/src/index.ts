import { config } from 'dotenv';
config({ override: true });
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { groupsRouter } from './routes/groups.js';
import { callsRouter } from './routes/calls.js';
import { svcRouter } from './routes/svc.js';
import { startScheduler } from './worker/scheduler.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/me', meRouter);
app.use('/groups', groupsRouter);
app.use('/svc', svcRouter);
app.use('/groups', callsRouter); // calls endpoints nested under /groups/:id

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

startScheduler();

