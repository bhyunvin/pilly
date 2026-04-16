import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL:
    process.env.NEXT_PUBLIC_NEON_AUTH_URL ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}`
      : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'),
  plugins: [magicLinkClient()],
});
