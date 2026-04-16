import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

/**
 * @description Better-Auth 라이브러리를 기반으로 구성된 인증 클라이언트 인스턴스입니다.
 * 매직 링크(Magic Link) 플러그인을 사용하여 비밀번호 없는 로그인을 지원하며, 프로젝트의 세션 및 인증 관리를 전담합니다.
 */
export const authClient = createAuthClient({
  baseURL:
    process.env.NEXT_PUBLIC_NEON_AUTH_URL ||
    (typeof globalThis === 'undefined'
      ? process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      : `${globalThis.location.origin}`),
  plugins: [magicLinkClient()],
});
