import { treaty } from '@elysiajs/eden';
import type { App } from '../../../api/src/index';

// 기존 fetch 대신 api 객체를 사용하여 타입 안전성을 확보하세요.
// 예시: const { data, error } = await api.medications.get({ headers: { Authorization: `Bearer ${token}` } })
export const api = treaty<App>(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');
