import { jwtClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * @description Better-Auth 라이브러리를 기반으로 구성된 인증 클라이언트 인스턴스입니다.
 * 매직 링크(Magic Link)와 JWT 플러그인을 사용하여 로그인 및 백엔드 API용 서명된 JWT 발급을 지원합니다.
 */
export const authClient = createAuthClient({
  baseURL:
    process.env.NEXT_PUBLIC_NEON_AUTH_URL ||
    (typeof globalThis === 'undefined'
      ? process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      : `${globalThis.location.origin}`),
  plugins: [magicLinkClient(), jwtClient()],
});
