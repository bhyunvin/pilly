/**
 * @file 스키마 정의 파일
 * @description Pilly 프로젝트의 PostgreSQL 데이터베이스 테이블 및 관계를 정의합니다.
 */

import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  timestamp,
  pgEnum,
  index,
  uuid,
  uniqueIndex,
  boolean,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';

/** 복약 상태를 나타내는 열거형 타입 */
export const medicationStatusEnum = pgEnum('medication_status', [
  'PENDING',
  'COMPLETED',
  'SKIPPED',
]);
/** 1:1 문의 상태를 나타내는 열거형 타입 */
export const inquiryStatusEnum = pgEnum('inquiry_status', ['PENDING', 'RESOLVED']);

/**
 * 사용자가 등록한 복약 정보 테이블입니다.
 */
export const userMedications = pgTable(
  'user_medications',
  {
    id: serial('id').primaryKey(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    name: text('name').notNull(),
    dosage: text('dosage'),
    frequency: text('frequency'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    status: text('status').default('TAKING'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('user_medications_user_id_idx').on(table.userId)],
);

export const medicationHistory = pgTable(
  'medication_history',
  {
    id: serial('id').primaryKey(),
    medicationId: integer('medication_id').references(() => userMedications.id, {
      onDelete: 'cascade',
    }),
    status: medicationStatusEnum('status').default('PENDING'),
    takenAt: timestamp('taken_at').defaultNow(),
  },
  (table) => [index('medication_history_medication_id_idx').on(table.medicationId)],
);

/**
 * 사용자와 AI 간의 채팅 세션 테이블입니다.
 */
export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: serial('id').primaryKey(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    title: text('title'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [index('chat_sessions_user_id_idx').on(table.userId)],
);

/**
 * AI 상담 로그 테이블입니다.
 *
 * @description
 * 사용자의 질문(prompt)과 AI의 답변(response)을 세션별로 기록합니다.
 * AI 상담 기능을 통해 도출된 데이터는 개인화된 서비스 제공의 기초가 됩니다.
 */
export const aiChatLogs = pgTable(
  'ai_chat_logs',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 255 }).notNull(),
    prompt: text('prompt').notNull(),
    response: text('response').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('ai_chat_logs_session_id_idx').on(table.sessionId),
    index('ai_chat_logs_user_id_idx').on(table.userId),
  ],
);

export const chatSessionsRelations = relations(chatSessions, ({ many }) => ({
  logs: many(aiChatLogs),
}));

export const aiChatLogsRelations = relations(aiChatLogs, ({ one }) => ({
  session: one(chatSessions, {
    fields: [aiChatLogs.sessionId],
    references: [chatSessions.id],
  }),
}));

/** 사용자 활동 로그 테이블 */
export const userActivityLogs = pgTable('user_activity_logs', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  action: text('action').notNull(),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * 의약품 식별 정보 카탈로그 테이블입니다.
 *
 * @description
 * 공공 데이터를 통해 수집된 의약품의 명칭, 외형, 색상, 이미지 정보를 저장합니다.
 * 사용자가 약물을 검색하거나 사진으로 식별할 때 이 데이터를 참조합니다.
 */
export const pillCatalog = pgTable(
  'pill_catalog',
  {
    id: serial('id').primaryKey(),
    itemSeq: varchar('item_seq', { length: 50 }).notNull().unique(),
    itemName: text('item_name').notNull(),
    entpName: text('entp_name'),
    chart: text('chart'),
    drugShape: varchar('drug_shape', { length: 100 }),
    colorClass1: varchar('color_class1', { length: 100 }),
    colorClass2: varchar('color_class2', { length: 100 }),
    lineFront: varchar('line_front', { length: 100 }),
    lineBack: varchar('line_back', { length: 100 }),
    itemImage: text('item_image'),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('item_name_idx').on(table.itemName),
    index('drug_shape_idx').on(table.drugShape),
    index('color_idx').on(table.colorClass1),
  ],
);

/** 관리자의 채팅 접근 권한 승인 기록 테이블 */
export const chatAccessApprovals = pgTable(
  'chat_access_approvals',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar('user_id', { length: 255 }).notNull(),
    chatSessionId: integer('chat_session_id').references(() => chatSessions.id, {
      onDelete: 'cascade',
    }),
    grantedAt: timestamp('granted_at').defaultNow().notNull(),
    accessedAt: timestamp('accessed_at'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('chat_access_approvals_chat_session_id_idx').on(table.chatSessionId)],
);

/** 사용자의 1:1 문의 내역 테이블 */
export const userInquiries = pgTable(
  'user_inquiries',
  {
    id: serial('id').primaryKey(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    chatSessionId: integer('chat_session_id').references(() => chatSessions.id, {
      onDelete: 'cascade',
    }),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull(),
    allowChatAccess: boolean('allow_chat_access').default(false),
    chatAccessId: uuid('chat_access_id').references(() => chatAccessApprovals.id, {
      onDelete: 'cascade',
    }),
    status: inquiryStatusEnum('status').default('PENDING'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('user_inquiries_user_id_idx').on(table.userId)],
);

/** 문의 사항에 첨부된 파일 정보 테이블 */
export const inquiryAttachments = pgTable(
  'inquiry_attachments',
  {
    id: serial('id').primaryKey(),
    inquiryId: integer('inquiry_id').references(() => userInquiries.id, { onDelete: 'cascade' }),
    fileUrl: text('file_url').notNull(),
    originalName: text('original_name').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [index('inquiry_attachments_inquiry_id_idx').on(table.inquiryId)],
);

/**
 * 사용자 프로필 및 계정 상태 테이블입니다.
 *
 * @description
 * 사용자의 닉네임, 역할(USER/ADMIN), 계정 상태(ACTIVE/RESTRICTED) 등을 관리합니다.
 * 계정 삭제 요청 시 `deletedAt` 컬럼에 일시가 기록되며 30일 후 스케줄러에 의해 실제 삭제됩니다.
 */
export const userProfiles = pgTable(
  'user_profiles',
  {
    userId: varchar('user_id', { length: 255 }).primaryKey(),
    nickname: varchar('nickname', { length: 255 }).notNull(),
    role: text('role').default('USER').notNull(),
    status: text('status').default('ACTIVE').notNull(),
    restrictedReason: text('restricted_reason'),
    restrictedAt: timestamp('restricted_at'),
    deletedAt: timestamp('deleted_at'),
    deletionReason: text('deletion_reason'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [uniqueIndex('nickname_unique_idx').on(table.nickname)],
);

/** 사용자 이용 제한 내역 테이블 */
export const userRestrictionHistory = pgTable('user_restriction_history', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => userProfiles.userId, { onDelete: 'cascade' }),
  adminId: varchar('admin_id', { length: 255 }).notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const userProfilesRelations = relations(userProfiles, ({ many }) => ({
  restrictionHistory: many(userRestrictionHistory),
}));
