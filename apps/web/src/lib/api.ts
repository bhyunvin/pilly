import { treaty } from '@elysiajs/eden';
import type { App } from '../../../api/src/index';

/**
 * @description ElysiaJS의 Eden Treaty를 활용한 타입 안전(Type-safe) API 클라이언트 인스턴스입니다.
 * 백엔드 서버의 타입 정의를 공유하여 런타임 및 컴파일 타임에 API 요청/응답의 타입을 보장합니다.
 *
 * @example const { data, error } = await api.medications.get({ headers: { Authorization: `Bearer ${token}` } });
 */
export const api = treaty<App>(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');
