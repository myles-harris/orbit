// Hand the URL to BullMQ intact rather than destructuring it. BullMQ does
// `new IORedis(url, rest)` when `url` is present (bullmq/dist/cjs/classes/
// redis-connection.js:182-183), and ioredis's URL parser handles rediss:// TLS,
// ACL usernames, and percent-decoding — all three of which the previous manual
// parse dropped.
export const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  maxRetriesPerRequest: null, // required by BullMQ
};
