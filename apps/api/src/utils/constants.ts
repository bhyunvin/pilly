/**
 * 사용자 계정의 상태를 나타내는 상수입니다.
 */
export const USER_STATUS = {
  /** 활성 상태 */
  ACTIVE: 'ACTIVE',
  /** 이용 제한 상태 */
  RESTRICTED: 'RESTRICTED',
} as const;

/**
 * 사용자의 권한 역할을 나타내는 상수입니다.
 */
export const USER_ROLE = {
  /** 관리자 권한 */
  ADMIN: 'ADMIN',
  /** 일반 사용자 권한 */
  USER: 'USER',
} as const;

/**
 * 액세스 토큰의 만료 시간(밀리초)입니다. 24시간을 의미합니다.
 */
export const ACCESS_EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * 시스템 전반에서 사용되는 오류 메시지 모음입니다.
 */
export const ERROR_MESSAGES = {
  /** 사용자를 찾을 수 없을 때의 메시지 */
  USER_NOT_FOUND: '사용자를 찾을 수 없습니다.',
  /** 권한이 없을 때의 메시지 */
  UNAUTHORIZED: '권한이 없습니다.',
} as const;

/** 사용자 상태 타입 */
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
/** 사용자 역할 타입 */
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
