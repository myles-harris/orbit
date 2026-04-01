import { app } from './app.js';
import { startScheduler } from './worker/scheduler.js';

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

startScheduler();

