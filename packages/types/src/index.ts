/**
 * 시스템 전반에서 사용되는 의약품 정보 인터페이스
 * @interface Medicine
 * @property {string} id - 약물의 고유 식별자
 * @property {string} name - 약품명
 * @property {string} manufacturer - 제조사 이름
 * @property {string} dosage - 1회 복용량 또는 규격
 * @property {string} [effect] - 효능 및 효과 (선택 사항)
 */
export interface Medicine {
  id: string;
  name: string;
  manufacturer: string;
  dosage: string;
  effect?: string;
}

/**
 * 기본 사용자 정보 인터페이스
 * @interface User
 * @property {string} id - 사용자의 고유 식별자 (UUID 또는 Provider ID)
 * @property {string} email - 사용자 이메일 주소
 * @property {string} name - 사용자의 실명 또는 닉네임
 */
export interface User {
  id: string;
  email: string;
  name: string;
}
