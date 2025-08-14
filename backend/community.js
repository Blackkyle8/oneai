const express = require('express');
const router = express.Router();
const { authenticateToken, validateInput } = require('./middleware');
const { getConnection } = require('./database');

/**
 * 커뮤니티 게시글 목록 조회
 * GET /api/community
 */
router.get('/', async (req, res) => {
    try {
        const connection = await getConnection();
        const [posts] = await connection.query(
            'SELECT p.*, u.nickname FROM posts p LEFT JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC'
        );
        res.json(posts);
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: '게시글 목록을 불러오는 중 오류가 발생했습니다.'
        });
    }
});

/**
 * 게시글 작성
 * POST /api/community
 */
router.post('/', authenticateToken, validateInput([
    'title',
    'content'
]), async (req, res) => {
    const { title, content } = req.body;
    const userId = req.user.id;

    try {
        const connection = await getConnection();
        const [result] = await connection.query(
            'INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)',
            [userId, title, content]
        );
        
        res.status(201).json({
            message: '게시글이 작성되었습니다.',
            postId: result.insertId
        });
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: '게시글 작성 중 오류가 발생했습니다.'
        });
    }
});

/**
 * 게시글 상세 조회
 * GET /api/community/:id
 */
router.get('/:id', async (req, res) => {
    const postId = req.params.id;

    try {
        const connection = await getConnection();
        const [[post]] = await connection.query(
            'SELECT p.*, u.nickname FROM posts p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = ?',
            [postId]
        );

        if (!post) {
            return res.status(404).json({
                error: 'Not found',
                message: '게시글을 찾을 수 없습니다.'
            });
        }

        res.json(post);
    } catch (error) {
        console.error('Error fetching post:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: '게시글을 불러오는 중 오류가 발생했습니다.'
        });
    }
});

// 라우터 내보내기
module.exports = router;
