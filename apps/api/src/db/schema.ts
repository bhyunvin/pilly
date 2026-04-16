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

export const medicationStatusEnum = pgEnum('medication_status', [
  'PENDING',
  'COMPLETED',
  'SKIPPED',
]);
export const inquiryStatusEnum = pgEnum('inquiry_status', ['PENDING', 'RESOLVED']);

export const userMedications = pgTable('user_medications', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  name: text('name').notNull(),
  dosage: text('dosage'),
  frequency: text('frequency'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  status: text('status').default('TAKING'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const medicationHistory = pgTable('medication_history', {
  id: serial('id').primaryKey(),
  medicationId: integer('medication_id').references(() => userMedications.id, {
    onDelete: 'cascade',
  }),
  status: medicationStatusEnum('status').default('PENDING'),
  takenAt: timestamp('taken_at').defaultNow(),
});

export const chatSessions = pgTable('chat_sessions', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  title: text('title'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const aiChatLogs = pgTable('ai_chat_logs', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 255 }).notNull(),
  prompt: text('prompt').notNull(),
  response: text('response').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const chatSessionsRelations = relations(chatSessions, ({ many }) => ({
  logs: many(aiChatLogs),
}));

export const aiChatLogsRelations = relations(aiChatLogs, ({ one }) => ({
  session: one(chatSessions, {
    fields: [aiChatLogs.sessionId],
    references: [chatSessions.id],
  }),
}));

export const userActivityLogs = pgTable('user_activity_logs', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  action: text('action').notNull(),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

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
  (table) => ({
    itemNameIdx: index('item_name_idx').on(table.itemName),
    drugShapeIdx: index('drug_shape_idx').on(table.drugShape),
    colorIdx: index('color_idx').on(table.colorClass1),
  }),
);

export const chatAccessApprovals = pgTable('chat_access_approvals', {
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
});

export const userInquiries = pgTable('user_inquiries', {
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
});

export const inquiryAttachments = pgTable('inquiry_attachments', {
  id: serial('id').primaryKey(),
  inquiryId: integer('inquiry_id').references(() => userInquiries.id, { onDelete: 'cascade' }),
  fileUrl: text('file_url').notNull(),
  originalName: text('original_name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

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
  (table) => ({
    nicknameUniqueIdx: uniqueIndex('nickname_unique_idx').on(table.nickname),
  }),
);

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
