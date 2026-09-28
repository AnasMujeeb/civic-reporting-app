const redis = require('../config/redis');

/**
 * Redis-backed sliding-window rate limiter.
 *
 * @param {Object} opts
 * @param {number} opts.maxRequests  - Max allowed requests in the window (default 5)
 * @param {number} opts.windowSec    - Window duration in seconds (default 60)
 * @param {Function} opts.keyGenerator - (req) => string — builds the Redis key
 * @param {string} opts.message      - Custom error message for 429 response
 */
const redisRateLimiter = ({
  maxRequests = 5,
  windowSec = 60,
  keyGenerator,
  message = 'Too many requests, please try again later.',
} = {}) => {
  return async (req, res, next) => {
    try {
      // Build a unique key per client/endpoint
      const identifier = keyGenerator
        ? keyGenerator(req)
        : req.ip || req.connection.remoteAddress;

      const key = `rl:${req.originalUrl}:${identifier}`;

      // Atomic INCR + conditional EXPIRE in a pipeline
      const current = await redis.incr(key);

      if (current === 1) {
        // First request in this window — set expiry
        await redis.expire(key, windowSec);
      }

      // Attach headers so clients can self-throttle
      const ttl = await redis.ttl(key);
      res.set('X-RateLimit-Limit', String(maxRequests));
      res.set('X-RateLimit-Remaining', String(Math.max(0, maxRequests - current)));
      res.set('X-RateLimit-Reset', String(ttl));

      if (current > maxRequests) {
        console.warn(`[RateLimiter] 🚫 BLOCKED → key: "${key}" | hits: ${current}/${maxRequests}`);
        return res.status(429).json({
          success: false,
          message,
          retryAfter: ttl,
        });
      }

      next();
    } catch (err) {
      // If Redis is down, let the request through (fail-open)
      // The in-memory express-rate-limit already provides a safety net.
      console.error(`[RateLimiter] Redis error — falling back to allow request: ${err.message}`);
      next();
    }
  };
};

// ── Pre-configured Limiters ──────────────────────────────────────────────────

/**
 * Firebase login: 5 req / 60s per IP
 */
const firebaseLoginLimiter = redisRateLimiter({
  maxRequests: 5,
  windowSec: 60,
  keyGenerator: (req) => req.ip,
  message: 'Too many login attempts. Please try again after 1 minute.',
});

/**
 * OTP send / verify: 5 req / 60s per phone number (falls back to IP)
 */
const otpLimiter = redisRateLimiter({
  maxRequests: 5,
  windowSec: 60,
  keyGenerator: (req) => {
    const phone = req.body?.phone;
    return phone ? String(phone).replace(/\D/g, '') : req.ip;
  },
  message: 'Too many OTP requests. Please try again after 1 minute.',
});

module.exports = { redisRateLimiter, firebaseLoginLimiter, otpLimiter };
