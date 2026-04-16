import { authClient } from '@/lib/auth';
import { useCallback } from 'react';

interface UseApiReturn {
  /** 인증 토큰을 자동으로 주입하여 API 요청을 수행하는 비동기 함수 */
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

/**
 * @description Pilly API 서버와의 통신을 관리하는 커스텀 훅입니다.
 * 인증 세션 유지, 베이스 URL 설정, 공통 헤더(Authorization 등) 처리를 자동화하여 보안과 타입 안전성을 확보합니다.
 *
 * @returns API 요청을 위한 fetch 래퍼 함수를 반환합니다.
 */
export const useApi = (): UseApiReturn => {
  /**
   * @description 백엔드 서버의 베이스 URL입니다.
   * 환경 변수 또는 로컬 호스트를 기준으로 /api/v1 프리픽스를 포함합니다.
   */
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/api/v1';

  /**
   * @description 인증 토큰을 자동으로 주입하여 API 요청을 수행하는 비동기 함수입니다.
   * 요청 본문이 FormData가 아닐 경우 기본적으로 Content-Type을 application/json으로 설정합니다.
   *
   * @async
   * @param endpoint - 요청할 API 엔드포인트 경로 (예: '/profile')
   * @param options - fetch API에 전달할 추가 옵션
   * @returns API 응답 객체를 반환합니다.
   */
  const apiFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
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
