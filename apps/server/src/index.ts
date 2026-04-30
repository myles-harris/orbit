import { app } from './app.js';
import { startScheduler } from './worker/scheduler.js';

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  process.exit(1);
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

startScheduler();

