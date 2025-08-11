const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'OneAI Backend is running!',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/user/profile', (req, res) => {
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
});

app.get('/api/ai-engines', (req, res) => {
    res.json([
        { id: 'gpt', name: 'ChatGPT', icon: 'G', status: 'connected' },
        { id: 'claude', name: 'Claude', icon: 'C', status: 'connected' },
        { id: 'gemini', name: 'Gemini', icon: '✦', status: 'connected' },
        { id: 'midjourney', name: 'Midjourney', icon: 'M', status: 'available' }
    ]);
});

app.get('/api/sharing', (req, res) => {
    res.json([
        {
            id: 'gpt-001',
            service: 'ChatGPT Plus',
            participants: 3,
            maxParticipants: 4,
            monthlyPrice: 6900,
            owner: '김**님',
            nextPayment: '2024-08-12'
        },
        {
            id: 'midjourney-002', 
            service: 'Midjourney Pro',
            participants: 2,
            maxParticipants: 5,
            monthlyPrice: 8300,
            owner: '이**님',
            nextPayment: '2024-08-20'
        }
    ]);
});

app.get('/api/business/stats', (req, res) => {
    res.json({
        totalEngines: 1247,
        totalRevenue: 2300000000,
        satisfaction: 89,
        support: '24/7'
    });
});

// Frontend Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.get('/community', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'community.html'));
});

app.get('/business', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'business.html'));
});

app.get('/sharing', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'sharing.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'profile.html'));
});

app.get('/healthcare', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'healthcare.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'login.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        error: 'API endpoint not found',
        path: req.path
    });
});

// Catch-all handler for frontend routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 OneAI Server running on http://localhost:${PORT}`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
    console.log(`🔗 API Health: http://localhost:${PORT}/api/health`);
    console.log(`\n🎯 Available pages:`);
    console.log(`   → http://localhost:${PORT}/`);
    console.log(`   → http://localhost:${PORT}/community`);
    console.log(`   → http://localhost:${PORT}/business`);  
    console.log(`   → http://localhost:${PORT}/sharing`);
    console.log(`   → http://localhost:${PORT}/profile`);
    console.log(`   → http://localhost:${PORT}/healthcare`);
    console.log(`   → http://localhost:${PORT}/login`);
});