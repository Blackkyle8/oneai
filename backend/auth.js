const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple');
const multer = require('multer');
const { pool } = require('./database');
const path = require('path');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'oneai-secret-key-2024';

// Apple 로그인 키 설정
const APPLE_KEY_PATH = process.env.APPLE_KEY_PATH || path.join(__dirname, '../config/apple-auth-key.p8');
const APPLE_KEY_ID = process.env.APPLE_KEY_ID;
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID;

// 토큰 검증 미들웨어
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
    }
    req.user = user;
    next();
  });
};

// Passport Google OAuth 설정
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/api/auth/oauth/google/callback",
  scope: ['profile', 'email']
},
async function(accessToken, refreshToken, profile, done) {
  try {
    // 기존 사용자 확인
    const result = await pool.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
    
    if (result.rows.length > 0) {
      return done(null, result.rows[0]);
    }
    
    // 새 사용자 생성
    const newUser = await pool.query(
      'INSERT INTO users (email, username, google_id, profile_image) VALUES ($1, $2, $3, $4) RETURNING *',
      [profile.emails[0].value, profile.displayName, profile.id, profile.photos[0]?.value]
    );
    
    return done(null, newUser.rows[0]);
  } catch (error) {
    return done(error, null);
  }
}));

// Apple OAuth 설정
passport.use(new AppleStrategy({
  clientID: APPLE_CLIENT_ID,
  teamID: APPLE_TEAM_ID,
  keyID: APPLE_KEY_ID,
  keyFilePath: APPLE_KEY_PATH,
  callbackURL: "/api/auth/oauth/apple/callback",
  passReqToCallback: true
},
async function(req, accessToken, refreshToken, idToken, profile, done) {
  try {
    const appleId = profile.id;
    const email = profile.email;
    const name = req.body.user ? JSON.parse(req.body.user).name : null;
    
    // 기존 사용자 확인
    const result = await pool.query('SELECT * FROM users WHERE apple_id = $1', [appleId]);
    
    if (result.rows.length > 0) {
      return done(null, result.rows[0]);
    }
    
    // 새 사용자 생성
    const newUser = await pool.query(
      'INSERT INTO users (email, username, apple_id) VALUES ($1, $2, $3) RETURNING *',
      [email, name?.firstName + ' ' + name?.lastName || email.split('@')[0], appleId]
    );
    
    return done(null, newUser.rows[0]);
  } catch (error) {
    return done(error, null);
  }
}));

// 회원가입
router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    
    // 이메일 중복 확인
    const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: '이미 등록된 이메일입니다.' });
    }
    
    // 비밀번호 해시화
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // 사용자 생성
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING id, email, username',
      [email, passwordHash, username]
    );
    
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.status(201).json({
      success: true,
      data: { user, token },
      message: '회원가입이 완료되었습니다.'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다.' });
  }
});

// 로그인
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // 사용자 조회
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    
    const user = result.rows[0];
    
    // 비밀번호 확인
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    
    // JWT 토큰 생성
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    // 비밀번호 제거
    delete user.password_hash;
    
    res.json({
      success: true,
      data: { user, token },
      message: '로그인 성공'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

// 토큰 검증
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    // authenticateToken 미들웨어가 성공했으면 req.user에 사용자 정보가 있음
    const userId = req.user.userId;
    
    // 데이터베이스에서 최신 사용자 정보 조회
    const result = await pool.query(
      'SELECT id, email, username, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    
    const user = result.rows[0];
    
    res.json({
      success: true,
      user: user,
      message: '토큰이 유효합니다.'
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: '토큰 검증 중 오류가 발생했습니다.' });
  }
});

// 현재 사용자 정보 조회
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(`
      SELECT 
        id, email, username, created_at, updated_at,
        profile_image, google_id, apple_id,
        subscription_type, subscription_status,
        language_preference, notification_settings
      FROM users 
      WHERE id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    
    const user = result.rows[0];
    
    res.json({
      success: true,
      data: user,
      message: '사용자 정보 조회 성공'
    });
  } catch (error) {
    console.error('사용자 정보 조회 오류:', error);
    res.status(500).json({ error: '사용자 정보 조회 중 오류가 발생했습니다.' });
  }
});

// 사용자 프로필 업데이트
router.patch('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { username, language_preference } = req.body;
    
    const updateFields = [];
    const values = [];
    let valueIndex = 1;
    
    if (username !== undefined) {
      updateFields.push(`username = $${valueIndex}`);
      values.push(username);
      valueIndex++;
    }
    
    if (language_preference !== undefined) {
      updateFields.push(`language_preference = $${valueIndex}`);
      values.push(language_preference);
      valueIndex++;
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: '업데이트할 필드가 없습니다.' });
    }
    
    updateFields.push(`updated_at = NOW()`);
    values.push(userId);
    
    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${valueIndex}
      RETURNING id, email, username, language_preference, updated_at
    `;
    
    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      data: result.rows[0],
      message: '프로필이 업데이트되었습니다.'
    });
  } catch (error) {
    console.error('프로필 업데이트 오류:', error);
    res.status(500).json({ error: '프로필 업데이트 중 오류가 발생했습니다.' });
  }
});

// 이메일 변경
router.patch('/me/email', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { email, password } = req.body;
    
    // 현재 비밀번호 확인
    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    
    const isValidPassword = await bcrypt.compare(password, userResult.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }
    
    // 이메일 중복 확인
    const emailExists = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
    if (emailExists.rows.length > 0) {
      return res.status(400).json({ error: '이미 사용 중인 이메일입니다.' });
    }
    
    // 이메일 업데이트
    const result = await pool.query(`
      UPDATE users 
      SET email = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, email, username
    `, [email, userId]);
    
    res.json({
      success: true,
      data: result.rows[0],
      message: '이메일이 변경되었습니다.'
    });
  } catch (error) {
    console.error('이메일 변경 오류:', error);
    res.status(500).json({ error: '이메일 변경 중 오류가 발생했습니다.' });
  }
});

// 비밀번호 변경
router.patch('/me/password', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;
    
    // 현재 비밀번호 확인
    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    
    const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }
    
    // 새 비밀번호 해시화
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);
    
    // 비밀번호 업데이트
    await pool.query(`
      UPDATE users 
      SET password_hash = $1, updated_at = NOW()
      WHERE id = $2
    `, [newPasswordHash, userId]);
    
    res.json({
      success: true,
      message: '비밀번호가 변경되었습니다.'
    });
  } catch (error) {
    console.error('비밀번호 변경 오류:', error);
    res.status(500).json({ error: '비밀번호 변경 중 오류가 발생했습니다.' });
  }
});

// 사용자 통계 조회
router.get('/me/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { period = '30d' } = req.query;
    
    // 기간 설정
    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
    
    // 통계 데이터 조회 (실제 구현에서는 적절한 테이블에서 조회)
    const stats = {
      streakDays: Math.floor(Math.random() * 100) + 50,
      totalConversations: Math.floor(Math.random() * 1000) + 1000,
      savedItems: Math.floor(Math.random() * 200) + 100,
      satisfaction: (4 + Math.random()).toFixed(1),
      monthlyConversations: Math.floor(Math.random() * 200) + 200,
      totalHours: Math.floor(Math.random() * 50) + 50,
      savedAmount: Math.floor(Math.random() * 100000) + 100000,
      favoritePrompts: Math.floor(Math.random() * 20) + 5,
      period: period
    };
    
    res.json({
      success: true,
      data: stats,
      message: '통계 조회 성공'
    });
  } catch (error) {
    console.error('통계 조회 오류:', error);
    res.status(500).json({ error: '통계 조회 중 오류가 발생했습니다.' });
  }
});

// 최근 활동 조회
router.get('/me/activity', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 10 } = req.query;
    
    // 실제 구현에서는 activity 테이블에서 조회
    const activities = [
      {
        id: 1,
        type: 'ai_conversation',
        title: 'ChatGPT로 코딩 문제 해결',
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
      },
      {
        id: 2,
        type: 'ai_conversation',
        title: 'Midjourney로 로고 디자인 생성',
        created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString()
      },
      {
        id: 3,
        type: 'sharing_joined',
        title: 'ChatGPT Plus 쉐어링 참여',
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString()
      },
      {
        id: 4,
        type: 'ai_conversation',
        title: 'Claude로 문서 요약 작업',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 5,
        type: 'setting_updated',
        title: '프로필 설정 업데이트',
        created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      }
    ].slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: activities,
      message: '최근 활동 조회 성공'
    });
  } catch (error) {
    console.error('최근 활동 조회 오류:', error);
    res.status(500).json({ error: '최근 활동 조회 중 오류가 발생했습니다.' });
  }
});

// 알림 설정 조회
router.get('/me/notifications/settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(`
      SELECT notification_settings 
      FROM users 
      WHERE id = $1
    `, [userId]);
    
    const settings = result.rows[0]?.notification_settings || {
      email: true,
      push: true,
      marketing: false,
      security: true
    };
    
    res.json({
      success: true,
      data: settings,
      message: '알림 설정 조회 성공'
    });
  } catch (error) {
    console.error('알림 설정 조회 오류:', error);
    res.status(500).json({ error: '알림 설정 조회 중 오류가 발생했습니다.' });
  }
});

// 알림 설정 업데이트
router.patch('/me/notifications/settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const settings = req.body;
    
    await pool.query(`
      UPDATE users 
      SET notification_settings = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(settings), userId]);
    
    res.json({
      success: true,
      data: settings,
      message: '알림 설정이 업데이트되었습니다.'
    });
  } catch (error) {
    console.error('알림 설정 업데이트 오류:', error);
    res.status(500).json({ error: '알림 설정 업데이트 중 오류가 발생했습니다.' });
  }
});

// 사용자 구독 정보 조회
router.get('/me/subscription', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(`
      SELECT 
        subscription_type, subscription_status,
        subscription_start_date, subscription_end_date
      FROM users 
      WHERE id = $1
    `, [userId]);
    
    const subscription = result.rows[0] || {
      subscription_type: 'pro',
      subscription_status: 'active',
      subscription_start_date: new Date('2024-03-01'),
      subscription_end_date: new Date('2024-09-01')
    };
    
    res.json({
      success: true,
      data: subscription,
      message: '구독 정보 조회 성공'
    });
  } catch (error) {
    console.error('구독 정보 조회 오류:', error);
    res.status(500).json({ error: '구독 정보 조회 중 오류가 발생했습니다.' });
  }
});

// 프로필 이미지 업로드 (multer 미들웨어 필요)
const upload = multer({ 
  dest: 'uploads/avatars/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('이미지 파일만 업로드 가능합니다.'), false);
    }
  }
});

router.post('/me/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    const userId = req.user.userId;
    
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }
    
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    
    await pool.query(`
      UPDATE users 
      SET profile_image = $1, updated_at = NOW()
      WHERE id = $2
    `, [avatarUrl, userId]);
    
    res.json({
      success: true,
      data: { profile_image: avatarUrl },
      message: '프로필 이미지가 업데이트되었습니다.'
    });
  } catch (error) {
    console.error('프로필 이미지 업로드 오류:', error);
    res.status(500).json({ error: '프로필 이미지 업로드 중 오류가 발생했습니다.' });
  }
});

// 계정 삭제
router.delete('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { password } = req.body;
    
    // 비밀번호 확인
    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    
    const isValidPassword = await bcrypt.compare(password, userResult.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    }
    
    // 계정 삭제 (실제로는 soft delete 또는 관련 데이터 정리)
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    
    res.json({
      success: true,
      message: '계정이 삭제되었습니다.'
    });
  } catch (error) {
    console.error('계정 삭제 오류:', error);
    res.status(500).json({ error: '계정 삭제 중 오류가 발생했습니다.' });
  }
});

// Google OAuth 로그인 시작
router.get('/oauth/google', (req, res, next) => {
  const state = req.query.state;
  
  // state 파라미터를 세션에 저장하거나 passport에 전달
  if (state) {
    req.session = req.session || {};
    req.session.oauthState = state;
  }
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
    state: state // state 파라미터 전달
  })(req, res, next);
});

// Google OAuth 콜백 - 로그인 페이지로 토큰과 함께 리다이렉트
router.get('/oauth/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/login.html?error=google_oauth_failed'
  }),
  async (req, res) => {
    try {
      const token = jwt.sign(
        { userId: req.user.id, email: req.user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      // state 파라미터에서 원래 redirect URL 가져오기
      const originalRedirect = req.query.state;
      let redirectUrl = '/login.html';
      
      // 토큰을 URL 파라미터로 전달
      const urlParams = new URLSearchParams({
        token: token,
        provider: 'google'
      });
      
      // 원래 redirect URL이 있으면 추가
      if (originalRedirect) {
        urlParams.append('redirect', originalRedirect);
      }
      
      redirectUrl += '?' + urlParams.toString();
      
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect('/login.html?error=google_oauth_failed');
    }
  }
);

// Apple 로그인 시작
router.get('/oauth/apple', (req, res, next) => {
  const state = req.query.state;
  
  if (state) {
    req.session = req.session || {};
    req.session.oauthState = state;
  }
  
  passport.authenticate('apple', {
    scope: ['email', 'name'],
    session: false,
    state: state
  })(req, res, next);
});

// Apple OAuth 콜백 - 로그인 페이지로 토큰과 함께 리다이렉트
router.post('/oauth/apple/callback',
  passport.authenticate('apple', {
    session: false,
    failureRedirect: '/login.html?error=apple_oauth_failed'
  }),
  async (req, res) => {
    try {
      const token = jwt.sign(
        { userId: req.user.id, email: req.user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      // state 파라미터에서 원래 redirect URL 가져오기
      const originalRedirect = req.body.state || req.query.state;
      let redirectUrl = '/login.html';
      
      // 토큰을 URL 파라미터로 전달
      const urlParams = new URLSearchParams({
        token: token,
        provider: 'apple'
      });
      
      // 원래 redirect URL이 있으면 추가
      if (originalRedirect) {
        urlParams.append('redirect', originalRedirect);
      }
      
      redirectUrl += '?' + urlParams.toString();
      
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Apple OAuth callback error:', error);
      res.redirect('/login.html?error=apple_oauth_failed');
    }
  }
);

// 추가: OAuth 에러 처리를 위한 미들웨어
router.use('/oauth/*/callback', (err, req, res, next) => {
  console.error('OAuth Error:', err);
  
  let errorType = 'oauth_failed';
  
  if (err.message && err.message.includes('access_denied')) {
    errorType = 'access_denied';
  } else if (err.message && err.message.includes('invalid_request')) {
    errorType = 'invalid_request';
  }
  
  res.redirect(`/login.html?error=${errorType}`);
});

// 테스트용 계정 생성 함수 개선
async function createTestAccountIfNotExists() {
  try {
    const testAccount = await pool.query('SELECT id FROM users WHERE email = $1', ['test@oneai.com']);
    
    if (testAccount.rows.length === 0) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('test1234', salt);
      
      await pool.query(
        `INSERT INTO users (email, username, password_hash, created_at, updated_at) 
         VALUES ($1, $2, $3, NOW(), NOW())`,
        ['test@oneai.com', 'Test User', passwordHash]
      );
      
      console.log('✅ 테스트 계정이 생성되었습니다. (email: test@oneai.com, password: test1234)');
    }
  } catch (error) {
    console.error('테스트 계정 생성 실패:', error);
  }
}

// 서버 시작 시 테스트 계정 생성
createTestAccountIfNotExists();

module.exports = {
  router,
  authenticateToken,
  JWT_SECRET
};