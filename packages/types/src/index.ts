/**
 * 시스템 전반에서 사용되는 의약품 정보 인터페이스
 */
export interface Medicine {
  /** 약물의 고유 식별자 */
  id: string;
  /** 약품명 */
  name: string;
  /** 제조사 이름 */
  manufacturer: string;
  /** 1회 복용량 또는 규격 */
  dosage: string;
  /** 효능 및 효과 (선택 사항) */
  effect?: string;
}

/**
 * 기본 사용자 정보 인터페이스
 */
export interface User {
  /** 사용자의 고유 식별자 (UUID 또는 Provider ID) */
  id: string;
  /** 사용자 이메일 주소 */
  email: string;
  /** 사용자의 실명 또는 닉네임 */
  name: string;
}
