import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authClient } from '@/lib/auth';
import { clearAuthTokenCache, useApi } from './useApi';

vi.mock('@/lib/auth', () => ({
  authClient: {
    token: vi.fn(),
  },
}));

const mockedToken = vi.mocked(authClient.token);

function createUnsignedJwt(expOffsetSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      sub: 'user_1',
      exp: Math.floor(Date.now() / 1000) + expOffsetSeconds,
    }),
  );
  return `${header}.${payload}.mock-sig`;
}

function mockJwtResponse(token: string) {
  return { data: { token }, error: null } as Awaited<ReturnType<typeof authClient.token>>;
}

function getRequestHeaders(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): Headers {
  const [, init] = fetchMock.mock.calls[callIndex] as [string, RequestInit];
  return init.headers as Headers;
}

describe('useApi Hook Unit Test', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthTokenCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('session.id가 아닌 서명 JWT를 Authorization Bearer 헤더로 주입하고 JSON Content-Type을 설정한다', async () => {
    const jwt = createUnsignedJwt(300);
    mockedToken.mockResolvedValue(mockJwtResponse(jwt));

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.apiFetch('/medications', {
        method: 'POST',
        body: JSON.stringify({ name: '타이레놀' }),
      });
      await result.current.apiFetch('/medications');
    });

    expect(mockedToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const headers = getRequestHeaders(fetchMock, 0);
    expect(headers.get('Authorization')).toBe(`Bearer ${jwt}`);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('FormData 전송 시 Content-Type 헤더를 강제 설정하지 않는다', async () => {
    const jwt = createUnsignedJwt(300);
    mockedToken.mockResolvedValue(mockJwtResponse(jwt));

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const formData = new FormData();
    formData.append('title', '복약 문의');

    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.apiFetch('/inquiry', {
        method: 'POST',
        body: formData,
      });
    });

    const headers = getRequestHeaders(fetchMock, 0);
    expect(headers.get('Authorization')).toBe(`Bearer ${jwt}`);
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('401 응답 시 토큰 캐시를 무효화하고 새 JWT로 1회 재시도한다', async () => {
    const staleJwt = createUnsignedJwt(300);
    const freshJwt = createUnsignedJwt(600);
    mockedToken
      .mockResolvedValueOnce(mockJwtResponse(staleJwt))
      .mockResolvedValueOnce(mockJwtResponse(freshJwt));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const { result } = renderHook(() => useApi());

    let response: Response | undefined;
    await act(async () => {
      response = await result.current.apiFetch('/profile');
    });

    expect(response?.status).toBe(200);
    expect(mockedToken).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retryHeaders = getRequestHeaders(fetchMock, 1);
    expect(retryHeaders.get('Authorization')).toBe(`Bearer ${freshJwt}`);
  });
});
