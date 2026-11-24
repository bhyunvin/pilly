export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'RESTRICTED';
export type MedicationStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED';
export type InquiryStatus = 'PENDING' | 'RESOLVED';

/** 공공데이터포털 기반 의약품 카탈로그 DTO (백엔드 PillCatalog와 1:1 매핑) */
export interface PillCatalog {
  id: number;
  itemSeq: string;
  itemName: string;
  entpName?: string | null;
  chart?: string | null;
  drugShape?: string | null;
  colorClass1?: string | null;
  colorClass2?: string | null;
  lineFront?: string | null;
  lineBack?: string | null;
  itemImage?: string | null;
  updatedAt?: string | null;
}

/** 사용자 제재 이력 DTO */
export interface UserRestrictionHistory {
  id: number;
  userId: string;
  adminId: string;
  reason: string;
  createdAt?: string | null;
}

/** 사용자 프로필 및 계정 상태 DTO */
export interface UserProfile {
  userId: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  restrictedReason?: string | null;
  restrictedAt?: string | null;
  deletedAt?: string | null;
  deletionReason?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  restrictionHistory?: UserRestrictionHistory[];
}

/** 사용자 복약 정보 DTO */
export interface UserMedication {
  id: number;
  userId?: string;
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  createdAt?: string | null;
}

/** 복약 체크 이력 DTO */
export interface MedicationHistoryItem {
  id: number;
  medicationId?: number | null;
  status?: MedicationStatus | null;
  takenAt?: string | null;
}

/** AI Vision 처방전/약봉투 인식 결과 DTO */
export interface AnalyzedMedication {
  id?: string;
  name: string;
  dosage: string;
  frequency: string;
  checked?: boolean;
}

/** AI 채팅 세션 DTO */
export interface ChatSession {
  id: number;
  userId?: string;
  title: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** AI 채팅 대화 로그 DTO */
export interface AiChatLog {
  id: number;
  sessionId?: number | null;
  userId: string;
  prompt: string;
  response: string;
  createdAt?: string | null;
}

/** 1:1 문의 첨부파일 DTO */
export interface InquiryAttachment {
  id: number;
  inquiryId?: number | null;
  fileUrl: string;
  originalName: string;
  createdAt?: string | null;
}

/** 1:1 문의 DTO */
export interface UserInquiry {
  id: number;
  userId: string;
  nickname?: string | null;
  chatSessionId?: number | null;
  title: string;
  content: string;
  allowChatAccess?: boolean | null;
  chatAccessId?: string | null;
  status?: InquiryStatus | null;
  createdAt?: string | null;
  attachments?: InquiryAttachment[];
}

/** 사용자 활동 로그 DTO */
export interface UserActivityLog {
  id: number;
  userId: string;
  action: string;
  details?: string | null;
  createdAt?: string | null;
}
