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
        id VARCHAR(36) PRIMARY KEY,
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
        custom_service_name VARCHAR(100),
        custom_price DECIMAL(10,2),
        custom_logo VARCHAR(500),
        custom_website VARCHAR(500),
        admin_note TEXT,
        started_at TIMESTAMP,
        payment_due_date DATE,
        auto_payment BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Sharing Participants 테이블 (참가자 관리)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sharing_participants (
        id VARCHAR(36) PRIMARY KEY,
        sharing_id VARCHAR(36) REFERENCES sharings(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        nickname VARCHAR(100),
        email VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending', -- pending, active, payment_failed, left
        monthly_cost INTEGER,
        payment_intent_id VARCHAR(255),
        payment_completed_at TIMESTAMP,
        joined_at TIMESTAMP DEFAULT NOW(),
        left_at TIMESTAMP,
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

    // Payment Logs 테이블 (Stripe 결제 로그)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        sharing_id VARCHAR(36) REFERENCES sharings(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL, -- payment_intent_created, subscription_created, etc.
        stripe_id VARCHAR(255) NOT NULL,
        stripe_payment_intent_id VARCHAR(255),
        amount INTEGER, -- Stripe uses cents
        currency VARCHAR(10) DEFAULT 'krw',
        description TEXT,
        metadata JSONB,
        status VARCHAR(50) DEFAULT 'pending',
        completed_at TIMESTAMP,
        failure_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Subscriptions 테이블 (Stripe 구독)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
        stripe_customer_id VARCHAR(255) NOT NULL,
        price_id VARCHAR(255) NOT NULL,
        sharing_id VARCHAR(36) REFERENCES sharings(id) ON DELETE SET NULL,
        status VARCHAR(50) DEFAULT 'active',
        current_period_start TIMESTAMP,
        current_period_end TIMESTAMP,
        cancel_at_period_end BOOLEAN DEFAULT false,
        canceled_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Stripe Customers 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stripe_customers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Stripe Prices 테이블 (가격 정보 캐싱)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stripe_prices (
        id SERIAL PRIMARY KEY,
        stripe_price_id VARCHAR(255) UNIQUE NOT NULL,
        stripe_product_id VARCHAR(255),
        name VARCHAR(255),
        description TEXT,
        amount INTEGER, -- cents
        currency VARCHAR(10) DEFAULT 'krw',
        type VARCHAR(20) DEFAULT 'recurring', -- one_time, recurring
        interval VARCHAR(20), -- month, year
        interval_count INTEGER DEFAULT 1,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
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
      'comments', 'oauth_accounts', 'user_settings',
      'payment_logs', 'subscriptions', 'stripe_customers', 'stripe_prices'
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

/**
 * 쿼리 실행 헬퍼 함수
 */
async function executeQuery(query, params = [], connection = null) {
  try {
    const client = connection || pool;
    const result = await client.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Query execution error:', error);
    throw error;
  }
}

/**
 * 데이터베이스 연결 객체 가져오기
 */
async function getConnection() {
  try {
    const connection = await pool.connect();
    return connection;
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

module.exports = { 
  pool, 
  createTables, 
  testConnection,
  executeQuery,
  getConnection,
  
  // Payment related functions
  savePaymentLog,
  updatePaymentLog,
  getPaymentHistory,
  saveSubscription,
  updateSubscriptionStatus,
  getSubscriptionByUser,
  getUserSubscriptions,
  saveCustomer,
  findCustomerByUserId,
  getUserById,
  updateSharingPaymentStatus,
  updateSharingParticipantStatus,
  checkSharingGroupPaymentComplete,
  activateSharingGroup,
  removeSharingParticipant
};

// ==================== PAYMENT FUNCTIONS ====================

/**
 * 결제 로그 저장
 */
async function savePaymentLog(logData) {
  const {
    userId,
    type,
    stripeId,
    amount,
    currency = 'krw',
    description,
    metadata = {},
    status = 'pending'
  } = logData;

  try {
    const result = await pool.query(
      `INSERT INTO payment_logs 
       (user_id, type, stripe_id, amount, currency, description, metadata, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [userId, type, stripeId, amount, currency, description, JSON.stringify(metadata), status]
    );
    return result.rows[0];
  } catch (error) {
    console.error('결제 로그 저장 오류:', error);
    throw error;
  }
}

/**
 * 결제 로그 업데이트
 */
async function updatePaymentLog(stripeId, updates) {
  const { status, completedAt, failureReason } = updates;
  
  try {
    const setParts = [];
    const values = [];
    let paramIndex = 1;

    if (status) {
      setParts.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    
    if (completedAt) {
      setParts.push(`completed_at = $${paramIndex++}`);
      values.push(completedAt);
    }
    
    if (failureReason) {
      setParts.push(`failure_reason = $${paramIndex++}`);
      values.push(failureReason);
    }

    setParts.push(`updated_at = NOW()`);
    values.push(stripeId);

    const result = await pool.query(
      `UPDATE payment_logs SET ${setParts.join(', ')} WHERE stripe_id = $${paramIndex} RETURNING *`,
      values
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('결제 로그 업데이트 오류:', error);
    throw error;
  }
}

/**
 * 결제 내역 조회
 */
async function getPaymentHistory(userId, options = {}) {
  const { page = 1, limit = 20, type } = options;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT * FROM payment_logs 
      WHERE user_id = $1
    `;
    const values = [userId];
    let paramIndex = 2;

    if (type) {
      query += ` AND type = $${paramIndex++}`;
      values.push(type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    
    // 총 개수 조회
    let countQuery = `SELECT COUNT(*) FROM payment_logs WHERE user_id = $1`;
    const countValues = [userId];
    
    if (type) {
      countQuery += ` AND type = $2`;
      countValues.push(type);
    }
    
    const countResult = await pool.query(countQuery, countValues);
    
    return {
      data: result.rows,
      page,
      limit,
      total: parseInt(countResult.rows[0].count)
    };
  } catch (error) {
    console.error('결제 내역 조회 오류:', error);
    throw error;
  }
}

/**
 * 구독 정보 저장
 */
async function saveSubscription(subscriptionData) {
  const {
    userId,
    stripeSubscriptionId,
    stripeCustomerId,
    priceId,
    sharingId,
    status,
    currentPeriodStart,
    currentPeriodEnd
  } = subscriptionData;

  try {
    const result = await pool.query(
      `INSERT INTO subscriptions 
       (user_id, stripe_subscription_id, stripe_customer_id, price_id, sharing_id, 
        status, current_period_start, current_period_end, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [userId, stripeSubscriptionId, stripeCustomerId, priceId, sharingId, 
       status, currentPeriodStart, currentPeriodEnd]
    );
    return result.rows[0];
  } catch (error) {
    console.error('구독 정보 저장 오류:', error);
    throw error;
  }
}

/**
 * 구독 상태 업데이트
 */
async function updateSubscriptionStatus(subscriptionId, updates) {
  const { 
    status, 
    currentPeriodStart, 
    currentPeriodEnd, 
    cancelAtPeriodEnd, 
    canceledAt, 
    deletedAt 
  } = updates;

  try {
    const setParts = [];
    const values = [];
    let paramIndex = 1;

    if (status) {
      setParts.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    
    if (currentPeriodStart) {
      setParts.push(`current_period_start = $${paramIndex++}`);
      values.push(currentPeriodStart);
    }
    
    if (currentPeriodEnd) {
      setParts.push(`current_period_end = $${paramIndex++}`);
      values.push(currentPeriodEnd);
    }
    
    if (cancelAtPeriodEnd !== undefined) {
      setParts.push(`cancel_at_period_end = $${paramIndex++}`);
      values.push(cancelAtPeriodEnd);
    }
    
    if (canceledAt) {
      setParts.push(`canceled_at = $${paramIndex++}`);
      values.push(canceledAt);
    }
    
    if (deletedAt) {
      setParts.push(`deleted_at = $${paramIndex++}`);
      values.push(deletedAt);
    }

    setParts.push(`updated_at = NOW()`);
    values.push(subscriptionId);

    const result = await pool.query(
      `UPDATE subscriptions SET ${setParts.join(', ')} 
       WHERE stripe_subscription_id = $${paramIndex} RETURNING *`,
      values
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('구독 상태 업데이트 오류:', error);
    throw error;
  }
}

/**
 * 사용자별 구독 조회
 */
async function getSubscriptionByUser(userId, subscriptionId) {
  try {
    const result = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 AND stripe_subscription_id = $2',
      [userId, subscriptionId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('구독 조회 오류:', error);
    throw error;
  }
}

/**
 * 사용자의 모든 구독 조회
 */
async function getUserSubscriptions(userId) {
  try {
    const result = await pool.query(
      `SELECT s.*, sp.name as price_name, sp.amount, sp.currency 
       FROM subscriptions s
       LEFT JOIN stripe_prices sp ON s.price_id = sp.stripe_price_id
       WHERE s.user_id = $1 AND s.deleted_at IS NULL
       ORDER BY s.created_at DESC`,
      [userId]
    );
    return result.rows;
  } catch (error) {
    console.error('사용자 구독 목록 조회 오류:', error);
    throw error;
  }
}

/**
 * Stripe 고객 정보 저장
 */
async function saveCustomer(customerData) {
  const { userId, stripeCustomerId, email } = customerData;

  try {
    const result = await pool.query(
      `INSERT INTO stripe_customers (user_id, stripe_customer_id, email, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET 
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       email = EXCLUDED.email,
       updated_at = NOW()
       RETURNING *`,
      [userId, stripeCustomerId, email]
    );
    return result.rows[0];
  } catch (error) {
    console.error('고객 정보 저장 오류:', error);
    throw error;
  }
}

/**
 * 사용자 ID로 Stripe 고객 조회
 */
async function findCustomerByUserId(userId) {
  try {
    const result = await pool.query(
      'SELECT * FROM stripe_customers WHERE user_id = $1',
      [userId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('고객 조회 오류:', error);
    throw error;
  }
}

/**
 * 사용자 정보 조회
 */
async function getUserById(userId) {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('사용자 조회 오류:', error);
    throw error;
  }
}

/**
 * 쉐어링 그룹 결제 상태 업데이트
 */
async function updateSharingPaymentStatus(sharingId, userId, status) {
  try {
    const result = await pool.query(
      `UPDATE sharing_participants 
       SET payment_status = $1, last_payment_at = NOW()
       WHERE sharing_id = $2 AND user_id = $3
       RETURNING *`,
      [status, sharingId, userId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('쉐어링 결제 상태 업데이트 오류:', error);
    throw error;
  }
}

/**
 * 쉐어링 참여자 상태 업데이트
 */
async function updateSharingParticipantStatus(sharingId, userId, status) {
  try {
    const result = await pool.query(
      `UPDATE sharing_participants 
       SET status = $1, updated_at = NOW()
       WHERE sharing_id = $2 AND user_id = $3
       RETURNING *`,
      [status, sharingId, userId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('쉐어링 참여자 상태 업데이트 오류:', error);
    throw error;
  }
}

/**
 * 쉐어링 그룹의 모든 참여자 결제 완료 확인
 */
async function checkSharingGroupPaymentComplete(sharingId) {
  try {
    const result = await pool.query(
      `SELECT 
         COUNT(*) as total_participants,
         COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_participants
       FROM sharing_participants 
       WHERE sharing_id = $1 AND status = 'approved'`,
      [sharingId]
    );
    
    const { total_participants, paid_participants } = result.rows[0];
    return parseInt(total_participants) === parseInt(paid_participants) && parseInt(total_participants) > 0;
  } catch (error) {
    console.error('쉐어링 그룹 결제 상태 확인 오류:', error);
    throw error;
  }
}

/**
 * 쉐어링 그룹 활성화
 */
async function activateSharingGroup(sharingId) {
  try {
    const result = await pool.query(
      `UPDATE sharings 
       SET status = 'active', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [sharingId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('쉐어링 그룹 활성화 오류:', error);
    throw error;
  }
}

/**
 * 쉐어링 참여자 제거
 */
async function removeSharingParticipant(sharingId, userId) {
  try {
    // 참여자 상태를 'left'로 변경 (완전 삭제 대신)
    const result = await pool.query(
      `UPDATE sharing_participants 
       SET status = 'left', updated_at = NOW()
       WHERE sharing_id = $1 AND user_id = $2
       RETURNING *`,
      [sharingId, userId]
    );
    
    // 쉐어링 그룹의 현재 참여자 수 업데이트
    await pool.query(
      `UPDATE sharings 
       SET current_participants = (
         SELECT COUNT(*) FROM sharing_participants 
         WHERE sharing_id = $1 AND status IN ('approved', 'pending')
       )
       WHERE id = $1`,
      [sharingId]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('쉐어링 참여자 제거 오류:', error);
    throw error;
  }
}