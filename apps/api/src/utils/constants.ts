export const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  RESTRICTED: 'RESTRICTED',
} as const;

export const USER_ROLE = {
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const;

export const ACCESS_EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export const ERROR_MESSAGES = {
  USER_NOT_FOUND: '사용자를 찾을 수 없습니다.',
  UNAUTHORIZED: '권한이 없습니다.',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
