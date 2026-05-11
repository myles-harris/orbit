import { config } from 'dotenv';
config({ override: true });
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { groupsRouter } from './routes/groups.js';
import { callsRouter } from './routes/calls.js';
import { svcRouter } from './routes/svc.js';
import usersRouter from './routes/users.js';

export const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/me', meRouter);
app.use('/users', usersRouter);
app.use('/groups', groupsRouter);
app.use('/svc', svcRouter);
app.use('/groups', callsRouter); // calls endpoints nested under /groups/:id

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled-error]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal_server_error' });
});
