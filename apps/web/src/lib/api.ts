/**
 * @description Pilly Rust 백엔드 API 서버의 기본 URL입니다.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * @description Rust 백엔드 API와 통신하기 위한 경량 fetch 래퍼입니다.
 */
export async function apiFetchJson<T>(
  path: string,
  options?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
