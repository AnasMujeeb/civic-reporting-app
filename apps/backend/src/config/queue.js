/**
 * config/queue.js
 *
 * Redis + BullMQ configuration.
 *
 * DEVELOPMENT MODE (no Redis):
 *   The connection uses lazyConnect so it won't throw on startup.
 *   If Redis is unreachable, `isRedisReady` stays false and the queue
 *   dispatcher automatically falls back to console.log stubs.
 *   The server boots clean — zero crashes.
 *
 * PRODUCTION MODE (Docker / Redis running):
 *   Set REDIS_HOST and REDIS_PORT in .env. Everything works as normal.
 */

const { Queue } = require('bullmq');
const Redis     = require('ioredis');

// ── Global flag so other modules know if Redis is usable ──────────────────────
let isRedisReady = false;
let notificationQueue = null;
let connection = null;

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT) || 6379;

// ── Create connection with lazyConnect so it doesn't throw on startup ──────────
connection = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,  // required by BullMQ
  lazyConnect: true,           // KEY: don't auto-connect on creation
  enableOfflineQueue: false,   // reject commands immediately when offline
  retryStrategy: () => null,   // disable auto-reconnect — we manage this manually
});

// ── Try to connect once; if it fails, stay in stub mode ───────────────────────
connection
  .connect()
  .then(() => {
    isRedisReady      = true;
    notificationQueue = new Queue('notification-queue', { connection });
    console.log(`✅ Redis connected at ${REDIS_HOST}:${REDIS_PORT} — BullMQ queues active.`);
  })
  .catch((err) => {
    isRedisReady = false;
    console.warn(
      `⚠️  Redis unavailable (${err.message}). ` +
      `BullMQ queues disabled — running in STUB mode. ` +
      `Start Redis or Docker to enable background jobs.`
    );
  });

// ── Suppress unhandled 'error' events that ioredis emits on retry ─────────────
connection.on('error', () => {
  // Intentionally silenced — we already warned above.
  // Remove this handler to see raw Redis errors again.
});

module.exports = {
  get connection()        { return connection; },
  get notificationQueue() { return notificationQueue; },
  get isRedisReady()      { return isRedisReady; },
};