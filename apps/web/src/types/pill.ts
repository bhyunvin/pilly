/**
 * @description 의약품의 상세 정보를 정의하는 인터페이스입니다.
 * 공공데이터 포털의 약학 정보 인덱스를 기반으로 하며, 검색 및 AI 상담 시 약품의 시각적/성분적 식별에 사용됩니다.
 */
export interface Pill {
  /** @description 데이터베이스 내 고유 식별자 */
  id: number;
  /** @description 품목 일련번호 */
  itemSeq: string;
  /** @description 제품명 */
  itemName: string;
  /** @description 업체명 */
  entpName: string;
  /** @description 성상 설명 */
  chart: string;
  /** @description 약의 모양 (원형, 장방형 등) */
  drugShape: string;
  /** @description 주요 색상 */
  colorClass1: string;
  /** @description 약품 이미지 URL */
  itemImage: string;
  /** @description 앞면 각인/선 */
  lineFront?: string;
  /** @description 뒷면 각인/선 */
  lineBack?: string;
}
