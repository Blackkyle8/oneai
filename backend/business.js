const express = require('express');
const { authenticateToken } = require('./auth-system');
const { pool } = require('./database');

const router = express.Router();

// AI 엔진 생성
router.post('/engines', authenticateToken, async (req, res) => {
  try {
    const { name, description, category, pricing_krw, prompt_chain } = req.body;
    
    const result = await pool.query(
      'INSERT INTO business_engines (creator_id, name, description, category, pricing_krw, prompt_chain) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.user.userId, name, description, category, pricing_krw, JSON.stringify(prompt_chain)]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Engine creation error:', error);
    res.status(500).json({ error: 'AI 엔진 생성 실패' });
  }
});

// 내 AI 엔진 목록
router.get('/my-engines', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM business_engines WHERE creator_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('My engines fetch error:', error);
    res.status(500).json({ error: '내 엔진 목록 조회 실패' });
  }
});

// 마켓플레이스 엔진 목록
router.get('/marketplace', async (req, res) => {
  try {
    const { category, sort } = req.query;
    
    let query = 'SELECT be.*, u.username as creator_name FROM business_engines be JOIN users u ON be.creator_id = u.id WHERE be.status = $1';
    const params = ['published'];
    
    if (category) {
      query += ' AND be.category = $2';
      params.push(category);
    }
    
    // 정렬
    switch(sort) {
      case 'popular':
        query += ' ORDER BY downloads_count DESC';
        break;
      case 'rating':
        query += ' ORDER BY rating DESC';
        break;
      default:
        query += ' ORDER BY created_at DESC';
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Marketplace fetch error:', error);
    res.status(500).json({ error: '마켓플레이스 조회 실패' });
  }
});

// AI 엔진 구매
router.post('/purchase/:engineId', authenticateToken, async (req, res) => {
  try {
    const engineId = req.params.engineId;
    
    // 엔진 정보 조회
    const engineResult = await pool.query('SELECT * FROM business_engines WHERE id = $1', [engineId]);
    const engine = engineResult.rows[0];
    
    if (!engine) {
      return res.status(404).json({ error: '엔진을 찾을 수 없습니다.' });
    }
    
    // 구매 기록 생성
    await pool.query(
      'INSERT INTO engine_purchases (user_id, engine_id, amount_krw) VALUES ($1, $2, $3)',
      [req.user.userId, engineId, engine.pricing_krw]
    );
    
    // 다운로드 수 증가
    await pool.query(
      'UPDATE business_engines SET downloads_count = downloads_count + 1 WHERE id = $1',
      [engineId]
    );
    
    res.json({ message: 'AI 엔진 구매가 완료되었습니다.' });
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({ error: '구매 처리 실패' });
  }
});

// 수익 통계
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    // 전체 수익
    const revenueResult = await pool.query(
      'SELECT SUM(amount_krw) as total_revenue FROM engine_purchases WHERE engine_id IN (SELECT id FROM business_engines WHERE creator_id = $1)',
      [req.user.userId]
    );
    
    // 월별 수익
    const monthlyResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        SUM(amount_krw) as revenue
      FROM engine_purchases
      WHERE engine_id IN (SELECT id FROM business_engines WHERE creator_id = $1)
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `, [req.user.userId]);
    
    // 엔진별 통계
    const engineStatsResult = await pool.query(`
      SELECT 
        be.name,
        COUNT(ep.id) as sales_count,
        SUM(ep.amount_krw) as total_revenue
      FROM business_engines be
      LEFT JOIN engine_purchases ep ON be.id = ep.engine_id
      WHERE be.creator_id = $1
      GROUP BY be.id, be.name
    `, [req.user.userId]);
    
    res.json({
      total_revenue: revenueResult.rows[0].total_revenue || 0,
      monthly_revenue: monthlyResult.rows,
      engine_stats: engineStatsResult.rows
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: '통계 조회 실패' });
  }
});

// AI 엔진 업데이트
router.put('/engines/:id', authenticateToken, async (req, res) => {
  try {
    const { name, description, category, pricing_krw, prompt_chain, status } = req.body;
    
    const result = await pool.query(
      'UPDATE business_engines SET name = $1, description = $2, category = $3, pricing_krw = $4, prompt_chain = $5, status = $6, updated_at = NOW() WHERE id = $7 AND creator_id = $8 RETURNING *',
      [name, description, category, pricing_krw, JSON.stringify(prompt_chain), status, req.params.id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '엔진을 찾을 수 없습니다.' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Engine update error:', error);
    res.status(500).json({ error: 'AI 엔진 업데이트 실패' });
  }
});

module.exports = router;