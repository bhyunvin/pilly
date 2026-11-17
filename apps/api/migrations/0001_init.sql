-- Pilly PostgreSQL 초기 스키마 마이그레이션

DO $$ BEGIN
    CREATE TYPE medication_status AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE inquiry_status AS ENUM ('PENDING', 'RESOLVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 사용자가 등록한 복약 정보 테이블
CREATE TABLE IF NOT EXISTS user_medications (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    name TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT,
    start_date TEXT,
    end_date TEXT,
    status TEXT DEFAULT 'TAKING',
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_medications_user_id_idx ON user_medications(user_id);

-- 복약 이력 테이블
CREATE TABLE IF NOT EXISTS medication_history (
    id SERIAL PRIMARY KEY,
    medication_id INTEGER REFERENCES user_medications(id) ON DELETE CASCADE,
    status medication_status DEFAULT 'PENDING',
    taken_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS medication_history_medication_id_idx ON medication_history(medication_id);

-- 사용자와 AI 간의 채팅 세션 테이블
CREATE TABLE IF NOT EXISTS chat_sessions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    title TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_sessions_user_id_idx ON chat_sessions(user_id);

-- AI 상담 로그 테이블
CREATE TABLE IF NOT EXISTS ai_chat_logs (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_chat_logs_session_id_idx ON ai_chat_logs(session_id);
CREATE INDEX IF NOT EXISTS ai_chat_logs_user_id_idx ON ai_chat_logs(user_id);

-- 사용자 활동 로그 테이블
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_activity_logs_user_id_idx ON user_activity_logs(user_id);

-- 의약품 식별 정보 카탈로그 테이블
CREATE TABLE IF NOT EXISTS pill_catalog (
    id SERIAL PRIMARY KEY,
    item_seq VARCHAR(50) NOT NULL UNIQUE,
    item_name TEXT NOT NULL,
    entp_name TEXT,
    chart TEXT,
    drug_shape VARCHAR(100),
    color_class1 VARCHAR(100),
    color_class2 VARCHAR(100),
    line_front VARCHAR(100),
    line_back VARCHAR(100),
    item_image TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS item_name_idx ON pill_catalog(item_name);
CREATE INDEX IF NOT EXISTS drug_shape_idx ON pill_catalog(drug_shape);
CREATE INDEX IF NOT EXISTS color_idx ON pill_catalog(color_class1);

-- 관리자의 채팅 접근 권한 승인 기록 테이블
CREATE TABLE IF NOT EXISTS chat_access_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    chat_session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT NOW() NOT NULL,
    accessed_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_access_approvals_chat_session_id_idx ON chat_access_approvals(chat_session_id);

-- 사용자의 1:1 문의 내역 테이블
CREATE TABLE IF NOT EXISTS user_inquiries (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    chat_session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    allow_chat_access BOOLEAN DEFAULT FALSE,
    chat_access_id UUID REFERENCES chat_access_approvals(id) ON DELETE CASCADE,
    status inquiry_status DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_inquiries_user_id_idx ON user_inquiries(user_id);

-- 문의 사항에 첨부된 파일 정보 테이블
CREATE TABLE IF NOT EXISTS inquiry_attachments (
    id SERIAL PRIMARY KEY,
    inquiry_id INTEGER REFERENCES user_inquiries(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    original_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inquiry_attachments_inquiry_id_idx ON inquiry_attachments(inquiry_id);

-- 사용자 프로필 및 계정 상태 테이블
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id VARCHAR(255) PRIMARY KEY,
    nickname VARCHAR(255) NOT NULL,
    role TEXT DEFAULT 'USER' NOT NULL,
    status TEXT DEFAULT 'ACTIVE' NOT NULL,
    restricted_reason TEXT,
    restricted_at TIMESTAMP,
    deleted_at TIMESTAMP,
    deletion_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS nickname_unique_idx ON user_profiles(nickname);

-- 사용자 이용 제한 내역 테이블
CREATE TABLE IF NOT EXISTS user_restriction_history (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    admin_id VARCHAR(255) NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
