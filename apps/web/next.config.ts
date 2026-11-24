import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ['types', 'utils'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
  redirects() {
    return Promise.resolve([
      {
        source: '/.well-known/change-password',
        destination: '/profile',
        permanent: false,
      },
    ]);
  },
};

export default nextConfig;
