'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const passport = require('passport');
const dotenv = require('dotenv');
dotenv.config();

const { pool, testConnection, createTables } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Core Middleware =====
app.use(cors({
  origin: function(origin, callback) {
    // 개발 환경에서는 모든 도메인 허용
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    // 운영 환경에서는 특정 도메인만 허용
    const allowedOrigins = [
      'https://oneai.com',
      'https://www.oneai.com',
      'https://app.oneai.com'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(passport.initialize());

// Dev request logger
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// ===== Swagger (OpenAPI) /api/docs =====
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'OneAI API', version: '1.0.0' },
  },
  // ✅ 백엔드 폴더만 스캔
  apis: [path.join(__dirname, './**/*.js')],
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

// ===== Routers =====
const authRouter = require('./auth').router;
const userRouter = require('./user');
// const aiEngineRouter = require('./ai-engines'); // 선택적
const sharingRouter = require('./sharing');
const communityRouter = require('./community');
const businessRouter = require('./business');

function mountIfExists(mountPath, modulePath) {
  try {
    const r = require(modulePath);
    if (r) app.use(mountPath, r);
    console.log(`✅ Mounted ${mountPath} from ${modulePath}`);
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      console.warn(`⚠️ Optional router not found: ${modulePath} (skip)`);
    } else {
      console.error(`❌ Failed to mount ${modulePath}:`, e);
    }
  }
}

// Auth routes
app.use('/api/auth', authRouter);
// User routes
app.use('/api/users', userRouter);
// AI Engine routes (선택)
mountIfExists('/api/ai-engines', './ai-engines');
// Sharing routes
app.use('/api/sharing', sharingRouter);
// Community routes
app.use('/api/community', communityRouter);
// Business routes
app.use('/api/business', businessRouter);

// ===== Health & Version =====
/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: OK
 */
app.get('/api/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    res.json({
      status: dbConnected ? 'OK' : 'DB_ERROR',
      message: 'OneAI Backend is running!',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: dbConnected ? 'connected' : 'disconnected',
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/api/version', (req, res) => {
  res.json({
    version: '1.0.0',
    api_version: 'v1',
    build: process.env.BUILD_NUMBER || 'dev',
    node_version: process.version,
  });
});

// ===== Legacy/Test =====
app.get('/api/user/profile', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', ['test@oneai.com']);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      delete user.password_hash;
      return res.json({
        ...user,
        stats: { totalChats: 1247, savedItems: 156, usageHours: 89, satisfaction: 4.9 },
      });
    }
    res.json({
      id: 1,
      name: '김사용자',
      email: 'user@oneai.com',
      plan: 'Pro',
      joinDate: '2024-03-01',
      stats: { totalChats: 1247, savedItems: 156, usageHours: 89, satisfaction: 4.9 },
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.get('/api/business/stats', (req, res) => {
  res.json({
    totalEngines: 1247,
    totalRevenue: 2300000000,
    satisfaction: 89,
    support: '24/7',
  });
});

// ===== Frontend Routes =====
const pages = [
  { path: '/', file: 'index.html' },
  { path: '/login', file: 'login.html' },
  { path: '/login.html', file: 'login.html' },
  { path: '/dashboard', file: 'dashboard.html' },
  { path: '/dashboard.html', file: 'dashboard.html' },
  { path: '/community', file: 'community.html' },
  { path: '/community.html', file: 'community.html' },
  { path: '/business', file: 'business.html' },
  { path: '/business.html', file: 'business.html' },
  { path: '/sharing', file: 'sharing.html' },
  { path: '/sharing.html', file: 'sharing.html' },
  { path: '/profile', file: 'profile.html' },
  { path: '/profile.html', file: 'profile.html' },
  { path: '/healthcare', file: 'healthcare.html' },
  { path: '/healthcare.html', file: 'healthcare.html' },
  { path: '/settings', file: 'settings.html' },
  { path: '/settings.html', file: 'settings.html' },
  { path: '/debug.html', file: 'debug.html' },
  { path: '/index.html', file: 'index.html' },
];

pages.forEach((page) => {
  app.get(page.path, (req, res) => {
    const filePath = path.join(__dirname, '../frontend', page.file);
    console.log(`Serving ${page.path} → ${page.file}`);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error(`Error serving ${page.file}:`, err);
        res.status(404).send('Page not found');
      }
    });
  });
});

// OAuth callbacks (stub)
app.get('/api/auth/oauth/google/callback', (req, res) => {
  res.redirect('/dashboard?oauth=success');
});
app.get('/api/auth/oauth/apple/callback', (req, res) => {
  res.redirect('/dashboard?oauth=success');
});

// ===== Error Handlers =====
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.path,
    method: req.method,
  });
});

// Static file fallback for .html files
app.get('*.html', (req, res) => {
  const requestedFile = req.path.substring(1); // Remove leading slash
  const filePath = path.join(__dirname, '../frontend', requestedFile);
  
  console.log(`Direct HTML request: ${req.path} → ${requestedFile}`);
  
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error(`Error serving ${requestedFile}:`, err);
      res.status(404).send('Page not found');
    }
  });
});

// SPA fallback (only for non-HTML, non-API routes)
app.get('*', (req, res) => {
  // Skip if it's an API route or has an extension
  if (req.path.startsWith('/api/') || req.path.includes('.')) {
    return res.status(404).send('Not found');
  }
  
  console.log(`SPA fallback: ${req.path} → index.html`);
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Global error handler
app.use((err, req, res) => {
  console.error('Error:', err);

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token', message: '유효하지 않은 토큰입니다.' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired', message: '토큰이 만료되었습니다.' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.stack : 'Internal Server Error',
  });
});

// ===== Server Init =====
async function startServer() {
  try {
    console.log('🔄 Connecting to database...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database. Please check your database configuration.');
      throw new Error('Database connection failed');
    }

    console.log('🔄 Initializing database tables...');
    await createTables();

    app.listen(3000, '0.0.0.0', () => {
      console.log('\n' + '='.repeat(60));
      console.log(`🚀 OneAI Server successfully started!`);
      console.log('='.repeat(60));
      console.log(`\n📡 Server Info:`);
      console.log(`   → Port: ${PORT}`);
      console.log(`   → Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   → Database: Connected ✅`);
      console.log(`\n🌐 URLs:`);
      console.log(`   → Frontend: http://localhost:${PORT}`);
      console.log(`   → API Health: http://localhost:${PORT}/api/health`);
      console.log(`   → API Docs: http://localhost:${PORT}/api/docs`);
      console.log(`\n📱 Available Pages:`);
      pages.forEach((page) => console.log(`   → http://localhost:${PORT}${page.path}`));
      console.log(`\n🔑 Test Account:`);
      console.log(`   → Email: test@oneai.com`);
      console.log(`   → Password: test1234`);
      console.log('\n' + '='.repeat(60));
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    throw error;
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await pool.end();
  /* eslint-disable no-process-exit */
  process.exit(0);
  /* eslint-enable no-process-exit */
});
process.on('SIGINT', async () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  await pool.end();
  /* eslint-disable no-process-exit */
  process.exit(0);
  /* eslint-enable no-process-exit */
});

startServer();

module.exports = app;
