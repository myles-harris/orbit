const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');

export const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  password: redisUrl.password || undefined,
  maxRetriesPerRequest: null, // required by BullMQ
};
