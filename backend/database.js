const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || 'oneai',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'oneai',
  password: process.env.DB_PASSWORD || 'oneai123',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 테이블 생성
async function createTables() {
  try {
    // Users 테이블 - name 필드 추가 및 인덱스 최적화
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100),
        name VARCHAR(100), -- API 클라이언트 호환성을 위해 추가
        password_hash VARCHAR(255) NOT NULL,
        profile_image VARCHAR(500),
        subscription_type VARCHAR(20) DEFAULT 'free',
        language VARCHAR(10) DEFAULT 'ko',
        agree_terms BOOLEAN DEFAULT false, -- 약관 동의 여부
        remember_token VARCHAR(255), -- 자동 로그인용 토큰
        last_login_at TIMESTAMP,
        email_verified BOOLEAN DEFAULT false,
        email_verify_token VARCHAR(255),
        password_reset_token VARCHAR(255),
        password_reset_expires TIMESTAMP,
        google_id VARCHAR(255),
        apple_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 인덱스 생성 (성능 최적화)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_remember_token ON users(remember_token);
    `);

    // AI Engines 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_ai_engines (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ai_engine_type VARCHAR(50),
        ai_engine_name VARCHAR(100),
        ai_engine_url VARCHAR(500),
        api_key VARCHAR(500), -- API 키 저장 (암호화 권장)
        icon VARCHAR(10),
        position INTEGER,
        is_active BOOLEAN DEFAULT true,
        usage_count INTEGER DEFAULT 0,
        last_used_at TIMESTAMP,
        settings JSONB, -- 엔진별 설정 저장
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Sharings 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sharings (
        id SERIAL PRIMARY KEY,
        creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ai_service_name VARCHAR(100) NOT NULL,
        service_type VARCHAR(50),
        max_participants INTEGER NOT NULL,
        current_participants INTEGER DEFAULT 0,
        monthly_cost_usd DECIMAL(10,2),
        individual_cost_krw INTEGER,
        status VARCHAR(20) DEFAULT 'recruiting',
        title VARCHAR(200),
        description TEXT,
        payment_due_date DATE,
        auto_payment BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Sharing Participants 테이블 (참가자 관리)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sharing_participants (
        id SERIAL PRIMARY KEY,
        sharing_id INTEGER REFERENCES sharings(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, left
        joined_at TIMESTAMP DEFAULT NOW(),
        payment_status VARCHAR(20) DEFAULT 'pending',
        last_payment_at TIMESTAMP,
        UNIQUE(sharing_id, user_id)
      )
    `);

    // Community Posts 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        content TEXT,
        category VARCHAR(50),
        tags TEXT[],
        view_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        is_pinned BOOLEAN DEFAULT false,
        status VARCHAR(20) DEFAULT 'active', -- active, deleted, hidden
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Comments 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        like_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Likes 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, post_id),
        UNIQUE(user_id, comment_id)
      )
    `);

    // Notifications 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL, -- comment, like, sharing, system
        title VARCHAR(200),
        message TEXT,
        related_id INTEGER, -- 관련 항목 ID (post_id, sharing_id 등)
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Files 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255),
        mime_type VARCHAR(100),
        size INTEGER,
        url VARCHAR(500),
        type VARCHAR(50), -- image, document, video, etc
        related_type VARCHAR(50), -- post, comment, profile, etc
        related_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // User Sessions 테이블 (세션 관리)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(500) UNIQUE NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Audit Logs 테이블 (보안 및 추적)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        old_values JSONB,
        new_values JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // OAuth Accounts 테이블 (소셜 로그인)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL, -- google, apple, kakao, naver
        provider_id VARCHAR(255) NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(provider, provider_id)
      )
    `);

    // Payment History 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        sharing_id INTEGER REFERENCES sharings(id) ON DELETE SET NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'KRW',
        payment_method VARCHAR(50),
        transaction_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed, refunded
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // User Settings 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        notification_email BOOLEAN DEFAULT true,
        notification_push BOOLEAN DEFAULT true,
        notification_sms BOOLEAN DEFAULT false,
        theme VARCHAR(20) DEFAULT 'dark',
        language VARCHAR(10) DEFAULT 'ko',
        timezone VARCHAR(50) DEFAULT 'Asia/Seoul',
        privacy_profile VARCHAR(20) DEFAULT 'public', -- public, friends, private
        two_factor_enabled BOOLEAN DEFAULT false,
        two_factor_secret VARCHAR(255),
        settings JSONB, -- 기타 설정을 JSON으로 저장
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 트리거 함수: updated_at 자동 업데이트
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // 각 테이블에 updated_at 트리거 적용
    const tablesWithUpdatedAt = [
      'users', 'user_ai_engines', 'sharings', 'posts', 
      'comments', 'oauth_accounts', 'user_settings'
    ];

    for (const table of tablesWithUpdatedAt) {
      await pool.query(`
        DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
        CREATE TRIGGER update_${table}_updated_at 
        BEFORE UPDATE ON ${table} 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);
    }

    console.log('✅ Database tables created successfully');
    console.log('✅ Indexes created successfully');
    console.log('✅ Triggers created successfully');
    
    // 초기 데이터 삽입 (선택사항)
    await insertInitialData();
    
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  }
}

// 초기 데이터 삽입 (개발용)
async function insertInitialData() {
  try {
    // 기본 AI 엔진 타입이 없다면 삽입
    /* eslint-disable no-unused-vars */
    const aiEngineTypes = [
    /* eslint-enable no-unused-vars */
      { type: 'chatgpt', name: 'ChatGPT', icon: '🤖' },
      { type: 'claude', name: 'Claude', icon: '🧠' },
      { type: 'gemini', name: 'Gemini', icon: '💎' },
      { type: 'perplexity', name: 'Perplexity', icon: '🔍' }
    ];

    // 개발 환경에서만 테스트 사용자 생성
    if (process.env.NODE_ENV === 'development') {
      const testUserExists = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        ['test@oneai.com']
      );

      if (testUserExists.rows.length === 0) {
        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash('test1234', salt);
        
        await pool.query(
          `INSERT INTO users (email, name, username, password_hash, subscription_type) 
           VALUES ($1, $2, $3, $4, $5)`,
          ['test@oneai.com', 'Test User', 'testuser', passwordHash, 'premium']
        );
        
        console.log('✅ Test user created (test@oneai.com / test1234)');
      }
    }
    
  } catch (err) {
    console.error('Initial data insertion error:', err);
  }
}

// 데이터베이스 연결 테스트
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected at:', result.rows[0].now);
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    return false;
  }
}

// 초기화 실행
if (require.main === module) {
  testConnection().then(connected => {
    if (connected) {
      createTables();
    }
  });
}

module.exports = { 
  pool, 
  createTables, 
  testConnection 
};