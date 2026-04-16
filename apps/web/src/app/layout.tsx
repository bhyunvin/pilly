import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/theme-provider';
import { AppShell } from '@/components/layout/AppShell';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

/**
 * 애플리케이션의 뷰포트 설정입니다.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

/**
 * 애플리케이션의 메타데이터 설정입니다.
 * SEO 및 소셜 공유(Open Graph, Twitter) 정보를 포함합니다.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://pilly-web.vercel.app'),
  title: {
    default: 'Pilly | 똑똑한 AI 복약 어시스턴트',
    template: '%s | Pilly',
  },
  description:
    '나만의 AI 복약 가이드, Pilly. 처방전을 분석하고 안전한 복약 스케줄을 관리하세요. 약 모양 검색부터 맞춤형 상담까지 가능합니다.',
  keywords: [
    '약 찾기',
    '약 모양 검색',
    'AI 복약 상담',
    '약 알림',
    '필리',
    'Pilly',
    '처방전 분석',
    '복약 가이드',
  ],
  authors: [{ name: 'Pilly Team' }],
  creator: 'Pilly Team',
  publisher: 'Pilly Team',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    apple: [
      { url: '/apple-icon-57x57.png', sizes: '57x57', type: 'image/png' },
      { url: '/apple-icon-60x60.png', sizes: '60x60', type: 'image/png' },
      { url: '/apple-icon-72x72.png', sizes: '72x72', type: 'image/png' },
      { url: '/apple-icon-76x76.png', sizes: '76x76', type: 'image/png' },
      { url: '/apple-icon-114x114.png', sizes: '114x114', type: 'image/png' },
      { url: '/apple-icon-120x120.png', sizes: '120x120', type: 'image/png' },
      { url: '/apple-icon-144x144.png', sizes: '144x144', type: 'image/png' },
      { url: '/apple-icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/apple-icon-180x180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    type: 'website',
    siteName: 'Pilly',
    title: 'Pilly - 당신을 위한 똑똑한 AI 복약 가이드',
    description:
      '처방전 분석과 AI 기반 복약 상담 서비스를 경험해보세요. 안전한 약 복용의 시작, Pilly가 함께합니다.',
    url: 'https://pilly-web.vercel.app',
    locale: 'ko_KR',
    images: [
      {
        url: '/android-icon-192x192.png',
        width: 192,
        height: 192,
        alt: 'Pilly 서비스 미리보기',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pilly | 똑똑한 AI 복약 어시스턴트',
    description: '처방전 사진 한 장으로 시작하는 안전한 복약 관리. Pilly AI와 상담하세요.',
    images: ['/android-icon-192x192.png'],
    creator: '@pilly_team',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

/**
 * 애플리케이션의 루트 레이아웃 컴포넌트입니다.
 * 폰트, 테마, 글로벌 셸, 분석 도구 등을 설정합니다.
 *
 * @param {Object} props - 컴포넌트 프롭스
 * @param {React.ReactNode} props.children - 하위 페이지 컴포넌트
 */
export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="ko" className={cn('font-sans', geist.variable)} suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.json" />
        <link
          rel="preload"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="min-h-[100dvh] bg-background text-foreground antialiased font-pretendard">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppShell>{children}</AppShell>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
