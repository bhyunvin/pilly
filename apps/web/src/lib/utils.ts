import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * @description Tailwind CSS 클래스들을 조건부로 결합하고 충돌을 해결하는 유틸리티 함수입니다.
 * clsx로 클래스를 조건부 결합한 후, twMerge를 통해 중복되거나 충돌하는 Tailwind 클래스를 최적화합니다.
 *
 * @param inputs - 결합할 클래스 값들의 목록
 * @returns 최적화 및 결합된 최종 클래스 문자열을 반환합니다.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
