import { authClient } from '@/lib/auth';
import { useCallback } from 'react';

/**
 * Pilly API 통신을 위한 공통 훅
 * 인증 헤더 및 베이스 URL(/api/v1 프리픽스 포함) 처리를 자동화함
 */
export const useApi = () => {
  // 백엔드 라우트 그룹 설정에 맞춰 /api/v1 프리픽스 추가
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/api/v1';

  /**
   * 인증이 필요한 API 요청을 수행하는 래퍼 함수
   * @param endpoint - API 엔드포인트 (예: '/profile')
   * @param options - fetch 옵션
   */
  const apiFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      const { data: sessionData } = await authClient.getSession();
      const sessionId = sessionData?.session?.id;

      const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
      };

      if (sessionId) {
        headers['Authorization'] = `Bearer ${sessionId}`;
      }

      if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }

      // endpoint가 이미 http로 시작하면 그대로 쓰고, 아니면 baseUrl과 결합
      const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

      return fetch(url, {
        ...options,
        headers,
      });
    },
    [baseUrl],
  );

  return { apiFetch };
};
