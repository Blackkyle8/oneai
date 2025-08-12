const express = require('express');
const router = express.Router();
const { pool } = require('./database');
const { authenticateToken } = require('./auth');

// 현재 사용자 정보 조회
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, name, username, profile_image, subscription_type, language, created_at FROM users WHERE id = $1',
            [req.user.userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('User fetch error:', error);
        res.status(500).json({ error: '사용자 정보 조회 중 오류가 발생했습니다.' });
    }
});

// 사용자 프로필 업데이트
router.patch('/me', authenticateToken, async (req, res) => {
    try {
        const { name, username, profile_image, language } = req.body;
        
        const result = await pool.query(
            'UPDATE users SET name = $1, username = $2, profile_image = $3, language = $4, updated_at = NOW() WHERE id = $5 RETURNING *',
            [name, username, profile_image, language, req.user.userId]
        );
        
        delete result.rows[0].password_hash;
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: '프로필 업데이트 중 오류가 발생했습니다.' });
    }
});

// 사용자 설정 조회
router.get('/me/settings', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM user_settings WHERE user_id = $1',
            [req.user.userId]
        );
        
        if (result.rows.length === 0) {
            // 기본 설정 생성
            const newSettings = await pool.query(
                'INSERT INTO user_settings (user_id) VALUES ($1) RETURNING *',
                [req.user.userId]
            );
            return res.json(newSettings.rows[0]);
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Settings fetch error:', error);
        res.status(500).json({ error: '설정 조회 중 오류가 발생했습니다.' });
    }
});

// 사용자 설정 업데이트
router.patch('/me/settings', authenticateToken, async (req, res) => {
    try {
        const settings = req.body;
        
        const result = await pool.query(
            `UPDATE user_settings 
             SET notification_email = $1, notification_push = $2, theme = $3, language = $4, settings = $5
             WHERE user_id = $6 RETURNING *`,
            [settings.notification_email, settings.notification_push, settings.theme, 
             settings.language, JSON.stringify(settings.extra || {}), req.user.userId]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Settings update error:', error);
        res.status(500).json({ error: '설정 업데이트 중 오류가 발생했습니다.' });
    }
});

module.exports = router;