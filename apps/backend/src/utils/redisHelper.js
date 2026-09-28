const redis = require('../config/redis');

/**
 * Get a cached value by key.
 * Returns parsed JSON if possible, raw string otherwise, or null on miss/error.
 */
const getCache = async (key) => {
  try {
    const data = await redis.get(key);
    if (data === null) {
      console.log(`[Redis] CACHE MISS → key: "${key}"`);
      return null;
    }
    console.log(`[Redis] CACHE HIT  → key: "${key}"`);
    try {
      return JSON.parse(data);
    } catch {
      return data; // return raw string if not valid JSON
    }
  } catch (err) {
    console.error(`[Redis] getCache ERROR → key: "${key}" | ${err.message}`);
    return null; // graceful fallback — caller proceeds to MongoDB
  }
};

/**
 * Set a cached value with an optional TTL (in seconds).
 * Objects are automatically JSON-stringified.
 */
const setCache = async (key, value, ttlInSeconds = 3600) => {
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlInSeconds && ttlInSeconds > 0) {
      await redis.set(key, serialized, 'EX', ttlInSeconds);
    } else {
      await redis.set(key, serialized);
    }
    console.log(`[Redis] CACHE SET  → key: "${key}" | TTL: ${ttlInSeconds}s`);
    return true;
  } catch (err) {
    console.error(`[Redis] setCache ERROR → key: "${key}" | ${err.message}`);
    return false; // non-fatal — app continues without caching
  }
};

/**
 * Delete a specific cached key.
 */
const deleteCache = async (key) => {
  try {
    const result = await redis.del(key);
    console.log(`[Redis] CACHE DEL  → key: "${key}" | deleted: ${result}`);
    return result;
  } catch (err) {
    console.error(`[Redis] deleteCache ERROR → key: "${key}" | ${err.message}`);
    return 0;
  }
};

/**
 * Flush all keys from the current Redis database.
 * ⚠️  Use with extreme caution — clears rate-limiter counters too.
 */
const flushCache = async () => {
  try {
    await redis.flushdb();
    console.log('[Redis] CACHE FLUSHED — all keys removed');
    return true;
  } catch (err) {
    console.error(`[Redis] flushCache ERROR | ${err.message}`);
    return false;
  }
};

module.exports = { getCache, setCache, deleteCache, flushCache };
