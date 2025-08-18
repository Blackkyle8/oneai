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

// 예상되는 모든 테이블 목록 (서비스별로 분류)
const EXPECTED_TABLES = {
  'User Management': [
    'users',
    'user_sessions', 
    'oauth_accounts',
    'user_settings'
  ],
  'AI Engine Management': [
    'user_ai_engines'
  ],
  'Sharing Service': [
    'sharings',
    'sharing_participants'
  ],
  'Community Features': [
    'posts',
    'comments',
    'likes'
  ],
  'System Features': [
    'notifications',
    'files',
    'audit_logs',
    'payment_history'
  ]
};

async function checkDatabaseStatus() {
  console.log('='.repeat(60));
  console.log('📊 PostgreSQL 데이터베이스 상태 확인 시작');
  console.log('='.repeat(60));
  
  try {
    // 1. 데이터베이스 연결 확인
    console.log('\n🔗 1. 데이터베이스 연결 확인');
    const connectionResult = await pool.query('SELECT current_database(), current_user, version(), now()');
    const connection = connectionResult.rows[0];
    
    console.log(`   ✅ 데이터베이스: ${connection.current_database}`);
    console.log(`   ✅ 사용자: ${connection.current_user}`);
    console.log(`   ✅ 연결 시간: ${connection.now}`);
    console.log(`   ✅ PostgreSQL 버전: ${connection.version.split(' ').slice(0, 2).join(' ')}`);
    
    // 2. 모든 테이블 조회
    console.log('\n📋 2. 생성된 테이블 목록 확인');
    const tablesResult = await pool.query(`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    const existingTables = tablesResult.rows.map(row => row.table_name);
    console.log(`   📊 총 ${existingTables.length}개의 테이블이 생성되었습니다.`);
    
    // 3. 서비스별 테이블 확인
    console.log('\n🏗️  3. 서비스별 테이블 상태 확인');
    let totalExpected = 0;
    let totalExists = 0;
    
    for (const [service, tables] of Object.entries(EXPECTED_TABLES)) {
      console.log(`\n   📁 ${service}:`);
      totalExpected += tables.length;
      
      for (const table of tables) {
        const exists = existingTables.includes(table);
        if (exists) {
          totalExists++;
          console.log(`      ✅ ${table}`);
        } else {
          console.log(`      ❌ ${table} (누락)`);
        }
      }
    }
    
    // 4. 테이블별 데이터 개수 확인
    console.log('\n📊 4. 테이블별 데이터 개수');
    for (const table of existingTables) {
      try {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = countResult.rows[0].count;
        console.log(`   📄 ${table}: ${count}개 레코드`);
      } catch (error) {
        console.log(`   ⚠️  ${table}: 개수 조회 실패 (${error.message})`);
      }
    }
    
    // 5. 인덱스 확인
    console.log('\n🔍 5. 인덱스 확인');
    const indexResult = await pool.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    
    console.log(`   📋 총 ${indexResult.rows.length}개의 인덱스가 생성되었습니다.`);
    const indexesByTable = {};
    indexResult.rows.forEach(row => {
      if (!indexesByTable[row.tablename]) {
        indexesByTable[row.tablename] = [];
      }
      indexesByTable[row.tablename].push(row.indexname);
    });
    
    for (const [table, indexes] of Object.entries(indexesByTable)) {
      console.log(`   📄 ${table}: ${indexes.length}개 인덱스`);
    }
    
    // 6. 트리거 확인
    console.log('\n⚡ 6. 트리거 확인');
    const triggerResult = await pool.query(`
      SELECT 
        trigger_name,
        event_object_table,
        action_timing,
        event_manipulation
      FROM information_schema.triggers 
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name
    `);
    
    console.log(`   ⚡ 총 ${triggerResult.rows.length}개의 트리거가 생성되었습니다.`);
    triggerResult.rows.forEach(row => {
      console.log(`   📄 ${row.event_object_table}: ${row.trigger_name} (${row.action_timing} ${row.event_manipulation})`);
    });
    
    // 7. 사용자 계정 확인
    console.log('\n👤 7. 테스트 사용자 계정 확인');
    const userResult = await pool.query(`
      SELECT id, email, username, name, subscription_type, created_at 
      FROM users 
      WHERE email = 'test@oneai.com'
    `);
    
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      console.log('   ✅ 테스트 계정이 존재합니다:');
      console.log(`      📧 이메일: ${user.email}`);
      console.log(`      👤 사용자명: ${user.username}`);
      console.log(`      📅 생성일: ${user.created_at}`);
      console.log(`      💳 구독 유형: ${user.subscription_type}`);
    } else {
      console.log('   ❌ 테스트 계정이 존재하지 않습니다.');
    }
    
    // 8. 종합 상태 보고서
    console.log('\n' + '='.repeat(60));
    console.log('📋 종합 상태 보고서');
    console.log('='.repeat(60));
    
    const completionRate = Math.round((totalExists / totalExpected) * 100);
    console.log(`📊 테이블 완성도: ${totalExists}/${totalExpected} (${completionRate}%)`);
    console.log(`📋 생성된 테이블: ${existingTables.length}개`);
    console.log(`🔍 생성된 인덱스: ${indexResult.rows.length}개`);
    console.log(`⚡ 생성된 트리거: ${triggerResult.rows.length}개`);
    
    if (completionRate === 100) {
      console.log('✅ 모든 서비스에 대한 데이터베이스가 올바르게 생성되었습니다!');
    } else {
      console.log('⚠️  일부 테이블이 누락되었습니다. 위의 상세 내용을 확인하세요.');
    }
    
    // 9. 추가 정보
    console.log('\n📝 추가 정보:');
    console.log('   🔐 인증 방식: Trust (로컬 연결)');
    console.log('   🌐 연결 주소: localhost:5432');
    console.log('   💾 데이터베이스명: oneai');
    console.log('   👤 데이터베이스 사용자: oneai');
    
  } catch (error) {
    console.error('❌ 데이터베이스 상태 확인 실패:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// 스크립트 실행
if (require.main === module) {
  checkDatabaseStatus()
    .then(() => {
      console.log('\n✅ 데이터베이스 상태 확인이 완료되었습니다.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 데이터베이스 상태 확인 중 오류가 발생했습니다:', error.message);
      process.exit(1);
    });
}

module.exports = { checkDatabaseStatus };