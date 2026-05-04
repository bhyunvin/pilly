import type { Metadata, Viewport } from 'next';

/**
 * 로그인 페이지 전용 Viewport 설정
 * 모바일 환경에서 입력 필드 포커스 시 자동 확대(Zoom)를 방지하기 위한 설정입니다.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#ffffff',
};

/**
 * 인증 중심 로그인 페이지에 특화된 프리미엄 메타데이터 설정
 */
export const metadata: Metadata = {
  title: '로그인 | Pilly',
  description:
    '스마트한 복약 관리의 시작, Pilly에 로그인하고 나만의 AI 복약 어시스턴트를 만나보세요.',
  openGraph: {
    title: 'Pilly 시작하기 - 나만의 AI 복약 어시스턴트',
    description: '스마트한 복약 관리의 시작, Pilly 로그인',
    url: 'https://pilly-web.vercel.app/login',
    images: [
      {
        url: '/android-icon-192x192.png',
        width: 192,
        height: 192,
        alt: 'Pilly 로그인 미리보기',
      },
    ],
  },
  twitter: {
    title: 'Pilly 시작하기 - 나만의 AI 복약 어시스턴트',
    description: '스마트한 복약 관리의 시작, Pilly 로그인',
    images: ['/android-icon-192x192.png'],
  },
};

export default function LoginLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactNode {
  return <>{children}</>;
}
