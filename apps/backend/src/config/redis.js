const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 5) {
      console.error('[Redis] Max reconnection attempts reached — running without cache.');
      return null; // stop retrying
    }
    return Math.min(times * 200, 2000); // exponential backoff capped at 2s
  },
});

redis.on('connect', () => {
  console.log('✅ Local Redis Connected Successfully!');
});

redis.on('error', (err) => {
  console.error('❌ Redis Connection Error:', err.message);
});

redis.on('close', () => {
  console.log('🔌 Redis connection closed.');
});

// ── Graceful Shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  console.log(`\n⏳ ${signal} received — disconnecting Redis…`);
  try {
    await redis.quit();
    console.log('✅ Redis disconnected cleanly.');
  } catch (err) {
    console.error('❌ Error disconnecting Redis:', err.message);
    redis.disconnect(); // force-close if quit() fails
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = redis;