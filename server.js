require('dotenv').config(); // ✅ MUST be first line

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const compression  = require('compression');
const rateLimit    = require('express-rate-limit');
const connectDB    = require('./config/db');
const { verifyConnection } = require('./utils/mailer');

// ─── DB + SMTP startup checks ─────────────────────────────────────────────────
connectDB();
verifyConnection(); // Logs SMTP status on startup

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, curl, server-side)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
  })
);
app.use(helmet());
app.use(compression());   // gzip all responses
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Rate limiting ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' },
});
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many signup attempts, please try again later' },
});
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/signup',          signupLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/leads',         require('./routes/leads'));
app.use('/api/meetings',      require('./routes/meetings'));
app.use('/api/onboarding',    require('./routes/onboarding'));
app.use('/api/team',          require('./routes/team'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/notifications', require('./routes/notifications'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) =>
  res.json({ status: 'OK', timestamp: new Date() })
);

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({
    message: 'Internal Server Error',
    // Only expose internal error message in non-production environments
    ...(process.env.NODE_ENV !== 'production' && { error: err.message }),
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8000;
app.listen(PORT, () =>
  console.log(`\n🚀 Zenska CRM server running on port ${PORT}\n`)
);
