import { useCallback } from 'react';
import { authClient } from '@/lib/auth';

interface UseApiReturn {
  /** 인증 JWT를 자동으로 주입하여 API 요청을 수행하는 비동기 함수 */
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const DEFAULT_TOKEN_TTL_MS = 45_000;
const MAX_TOKEN_TTL_MS = 60_000;
const EXPIRY_SAFETY_MARGIN_MS = 30_000;

let cachedToken: CachedToken | null = null;
let inFlightTokenRequest: Promise<string | null> | null = null;

/**
 * @description 메모리에 캐싱된 JWT 토큰을 즉시 무효화합니다.
 * 로그아웃 또는 401 인증 오류 발생 시 이전 세션의 토큰이 재사용되는 것을 방지합니다.
 */
export function clearAuthTokenCache(): void {
  cachedToken = null;
  inFlightTokenRequest = null;
}

/**
 * JWT 페이로드의 `exp` 클레임(초 단위 Unix Timestamp)을 파싱해 안전한 캐시 만료 시각(ms)을 계산합니다.
 */
function computeTokenExpiryMs(token: string): number {
  const now = Date.now();
  const fallback = now + DEFAULT_TOKEN_TTL_MS;

  try {
    const segments = token.split('.');
    if (segments.length !== 3 || !segments[1]) return fallback;

    const base64 = segments[1].replaceAll('-', '+').replaceAll('_', '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };

    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
      const safeExpiry = payload.exp * 1000 - EXPIRY_SAFETY_MARGIN_MS;
      return Math.min(safeExpiry, now + MAX_TOKEN_TTL_MS);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

async function fetchJwtToken(): Promise<string | null> {
  try {
    const { data, error } = await authClient.token();
    const token = !error && data && typeof data.token === 'string' ? data.token : null;
    if (!token) {
      cachedToken = null;
      return null;
    }

    const expiresAt = computeTokenExpiryMs(token);
    if (expiresAt > Date.now()) {
      cachedToken = { token, expiresAt };
    } else {
      cachedToken = null;
    }
    return token;
  } catch {
    cachedToken = null;
    return null;
  }
}

async function getAuthToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  if (forceRefresh) {
    cachedToken = null;
  }

  if (!inFlightTokenRequest) {
    inFlightTokenRequest = fetchJwtToken().finally(() => {
      inFlightTokenRequest = null;
    });
  }

  return inFlightTokenRequest;
}

/**
 * @description Pilly API 서버와의 통신을 관리하는 커스텀 훅입니다.
 * Better Auth JWT 플러그인에서 서명된 JWT를 획득해 인메모리에 짧게 캐싱하고,
 * 요청 시 `Authorization: Bearer <jwt>` 헤더를 자동으로 주입합니다.
 *
 * @returns API 요청을 위한 fetch 래퍼 함수를 반환합니다.
 */
export const useApi = (): UseApiReturn => {
  const baseUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1`;

  const apiFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
      const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
      const callerHeaders = new Headers(options.headers);
      const hasExplicitAuth = callerHeaders.has('Authorization');

      const buildHeaders = (jwt: string | null): Headers => {
        const headers = new Headers(options.headers);
        if (!hasExplicitAuth && jwt) {
          headers.set('Authorization', `Bearer ${jwt}`);
        }
        if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        return headers;
      };

      const initialToken = hasExplicitAuth ? null : await getAuthToken(false);
      const response = await fetch(url, {
        ...options,
        headers: buildHeaders(initialToken),
      });

      if (response.status === 401 && !hasExplicitAuth) {
        clearAuthTokenCache();
        const refreshedToken = await getAuthToken(true);
        if (refreshedToken && refreshedToken !== initialToken) {
          return fetch(url, {
            ...options,
            headers: buildHeaders(refreshedToken),
          });
        }
      }

      return response;
    },
    [baseUrl],
  );

  return { apiFetch };
};
