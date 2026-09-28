const dotenv    = require('dotenv');
dotenv.config(); // MUST be first — modules below read process.env at load time

const express   = require('express');
const path      = require('path');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const connectDB = require('./config/db');

// ── Rate Limiters ─────────────────────────────────────────────────────────────
const { apiLimiter, authLimiter } = require('./middlewares/rateLimiter');

// ── Route imports ─────────────────────────────────────────────────────────────
const authRoutes         = require('./routes/authRoutes');
const reportRoutes       = require('./routes/reportRoutes');
const contractorRoutes   = require('./routes/contractor.routes');
const workOrderRoutes    = require('./routes/workOrder.routes');
const notificationRoutes = require('./routes/notification.routes');
const budgetRoutes       = require('./routes/budget.routes');
const auditRoutes        = require('./routes/audit.routes');
const userRoutes         = require('./routes/user.routes');
const analyticsRoutes     = require('./routes/analytics.routes');
const locationRoutes      = require('./routes/location.routes');

// ── Global error handler (must be last) ───────────────────────────────────────
const errorHandler = require('./middlewares/errorHandler');

// dotenv.config() is called at the top of this file (before any imports that read env vars)

const app = express();

// ── Database ──────────────────────────────────────────────────────────────────
connectDB();

// ── Core Middleware ────────────────────────────────────────────────────────────
app.use(helmet());

// CORS — restrict to known frontend origins (comma-separated in CLIENT_URL)
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000,http://localhost:8081')
  .split(',')
  .map((o) => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Static file serving for local upload fallback ─────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Morgan HTTP request logger (dev mode)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Global API Rate Limiter
app.use('/api/v1/', apiLimiter);

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',        authLimiter, authRoutes); // Strict rate limit for auth
app.use('/api/v1/reports',       reportRoutes);
app.use('/api/v1/contractors',   contractorRoutes);
app.use('/api/v1/work-orders',   workOrderRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/budget',         budgetRoutes);
app.use('/api/v1/audit-logs',     auditRoutes);
app.use('/api/v1/users',          userRoutes);
app.use('/api/v1/analytics',      analyticsRoutes);
app.use('/api/v1/location',       locationRoutes);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ── 404 Handler — catch all unmatched routes ──────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// ── Global Error Handler (must be the LAST app.use) ───────────────────────────
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health check: http://localhost:${PORT}/api/v1/health\n`);
});