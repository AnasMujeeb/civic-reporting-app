/**
 * errorHandler.js
 * Global Express error handling middleware.
 * Must be registered LAST in server.js: app.use(errorHandler)
 *
 * Catches all errors forwarded via next(error) from any controller.
 */

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  let message    = err.message || 'Internal Server Error';

  // ── Mongoose: CastError (invalid ObjectId) ────────────────────────────────
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400;
    message    = `Invalid ID format: "${err.value}"`;
  }

  // ── Mongoose: Duplicate Key (unique constraint) ───────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    statusCode  = 409;
    message     = `A record with this ${field} already exists.`;
  }

  // ── Mongoose: Validation Error ────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message    = Object.values(err.errors)
      .map((e) => e.message)
      .join('; ');
  }

  // ── JWT Errors ────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError')  { statusCode = 401; message = 'Invalid token. Please log in again.'; }
  if (err.name === 'TokenExpiredError')  { statusCode = 401; message = 'Token expired. Please log in again.'; }

  // ── Multer Errors ─────────────────────────────────────────────────────────
  if (err.name === 'MulterError') {
    statusCode = 400;
    message    = `File upload error: ${err.message}`;
  }

  // In production, don't leak internal error details
  const isDev = process.env.NODE_ENV === 'development';

  res.status(statusCode).json({
    success: false,
    message,
    ...(isDev && { stack: err.stack }),
  });
};

module.exports = errorHandler;
