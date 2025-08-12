const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

// Database connection
const { pool, testConnection, createTables } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://oneai.com', 'https://www.oneai.com']
        : ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Request logging middleware (개발용)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// ===== API Routes =====

// Import routers
const authRouter = require('./auth');
const userRouter = require('./user');
// const aiEngineRouter = require('./ai-engines');
const sharingRouter = require('./sharing');
const communityRouter = require('./community');
const businessRouter = require('./business');

// Auth routes (인증 관련)
app.use('/api/auth', authRouter);

// User routes (사용자 관련)
app.use('/api/users', userRouter);

// AI Engine routes
app.use('/api/ai-engines', aiEngineRouter);

// Sharing routes
app.use('/api/sharing', sharingRouter);

// Community routes
app.use('/api/community', communityRouter);

// Business routes
app.use('/api/business', businessRouter);

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Database 연결 상태 확인
        const dbConnected = await testConnection();
        
        res.json({ 
            status: dbConnected ? 'OK' : 'DB_ERROR',
            message: 'OneAI Backend is running!',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            database: dbConnected ? 'connected' : 'disconnected'
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Version info
app.get('/api/version', (req, res) => {
    res.json({
        version: '1.0.0',
        api_version: 'v1',
        build: process.env.BUILD_NUMBER || 'dev',
        node_version: process.version
    });
});

// Legacy endpoints (기존 호환성 유지)
app.get('/api/user/profile', async (req, res) => {
    // 인증 미들웨어 없이 테스트용으로 제공
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            ['test@oneai.com']
        );
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            delete user.password_hash;
            res.json({
                ...user,
                stats: {
                    totalChats: 1247,
                    savedItems: 156,
                    usageHours: 89,
                    satisfaction: 4.9
                }
            });
        } else {
            res.json({
                id: 1,
                name: '김사용자',
                email: 'user@oneai.com',
                plan: 'Pro',
                joinDate: '2024-03-01',
                stats: {
                    totalChats: 1247,
                    savedItems: 156,
                    usageHours: 89,
                    satisfaction: 4.9
                }
            });
        }
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
        support: '24/7'
    });
});

// ===== Frontend Routes =====

// Main pages
const pages = [
    { path: '/', file: 'index.html' },
    { path: '/login', file: 'login.html' },
    { path: '/dashboard', file: 'dashboard.html' },
    { path: '/community', file: 'community.html' },
    { path: '/business', file: 'business.html' },
    { path: '/sharing', file: 'sharing.html' },
    { path: '/profile', file: 'profile.html' },
    { path: '/healthcare', file: 'healthcare.html' },
    { path: '/settings', file: 'settings.html' }
];

pages.forEach(page => {
    app.get(page.path, (req, res) => {
        const filePath = path.join(__dirname, '../frontend', page.file);
        res.sendFile(filePath, (err) => {
            if (err) {
                console.error(`Error serving ${page.file}:`, err);
                // 파일이 없으면 index.html로 fallback
                res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
            }
        });
    });
});

// OAuth callback routes
app.get('/api/auth/oauth/google/callback', (req, res) => {
    // Google OAuth callback 처리
    const { code, state } = req.query;
    // TODO: Google OAuth 토큰 교환 및 사용자 생성/로그인
    res.redirect('/dashboard?oauth=success');
});

app.get('/api/auth/oauth/apple/callback', (req, res) => {
    // Apple OAuth callback 처리
    const { code, state } = req.query;
    // TODO: Apple OAuth 토큰 교환 및 사용자 생성/로그인
    res.redirect('/dashboard?oauth=success');
});

// ===== Error Handlers =====

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        error: 'API endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Catch-all handler for frontend routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    // JWT 에러 처리
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
            error: 'Invalid token',
            message: '유효하지 않은 토큰입니다.'
        });
    }
    
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ 
            error: 'Token expired',
            message: '토큰이 만료되었습니다.'
        });
    }
    
    // 기본 에러 응답
    res.status(err.status || 500).json({ 
        error: err.message || 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.stack : 'Internal Server Error'
    });
});

// ===== Server Initialization =====

async function startServer() {
    try {
        // Database 연결 테스트
        console.log('🔄 Connecting to database...');
        const dbConnected = await testConnection();
        
        if (!dbConnected) {
            console.error('❌ Failed to connect to database. Please check your database configuration.');
            process.exit(1);
        }
        
        // 테이블 생성 (없으면)
        console.log('🔄 Initializing database tables...');
        await createTables();
        
        // 서버 시작
        app.listen(PORT, () => {
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
            pages.forEach(page => {
                console.log(`   → http://localhost:${PORT}${page.path}`);
            });
            console.log(`\n🔑 Test Account:`);
            console.log(`   → Email: test@oneai.com`);
            console.log(`   → Password: test1234`);
            console.log('\n' + '='.repeat(60));
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server');
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\nSIGINT signal received: closing HTTP server');
    await pool.end();
    process.exit(0);
});

// Start the server
startServer();

module.exports = app;