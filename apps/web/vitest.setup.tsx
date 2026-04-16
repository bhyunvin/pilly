import '@testing-library/jest-dom/vitest';
import * as React from 'react';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// 각 테스트 후 DOM 정리
afterEach(() => {
  cleanup();
});

// 브라우저 API가 없는 환경에서의 Mocking (matchMedia 등)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // SpeechSynthesis Mocking (useTTS 훅 테스트용)
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      onvoiceschanged: null,
    },
    writable: true,
  });

  // SpeechSynthesisUtterance Mocking
  class MockSpeechSynthesisUtterance {
    text: string = '';
    lang: string = '';
    voice: SpeechSynthesisVoice | null = null;
    rate: number = 1;
    pitch: number = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(text: string) {
      this.text = text;
    }
  }

  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    value: MockSpeechSynthesisUtterance,
    writable: true,
  });
}

// Next.js Navigation Mocking
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Next.js Image Mocking
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    return React.createElement('img', { ...props, alt: props.alt || '' });
  },
}));
