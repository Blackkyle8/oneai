const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/oneai',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 테이블 생성
async function createTables() {
  try {
    // Users 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100),
        password_hash VARCHAR(255) NOT NULL,
        profile_image VARCHAR(500),
        subscription_type VARCHAR(20) DEFAULT 'free',
        language VARCHAR(10) DEFAULT 'ko',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // AI Engines 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_ai_engines (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        ai_engine_type VARCHAR(50),
        ai_engine_name VARCHAR(100),
        ai_engine_url VARCHAR(500),
        icon VARCHAR(10),
        position INTEGER,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Sharings 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sharings (
        id SERIAL PRIMARY KEY,
        creator_id INTEGER REFERENCES users(id),
        ai_service_name VARCHAR(100) NOT NULL,
        service_type VARCHAR(50),
        max_participants INTEGER NOT NULL,
        current_participants INTEGER DEFAULT 0,
        monthly_cost_usd DECIMAL(10,2),
        individual_cost_krw INTEGER,
        status VARCHAR(20) DEFAULT 'recruiting',
        title VARCHAR(200),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Database tables created successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

createTables();

module.exports = { pool };