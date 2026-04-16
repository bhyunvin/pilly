# 💊 Pilly

[![Bun](https://img.shields.io/badge/Bun-1.2.4-black?logo=bun)](https://bun.sh/)
[![Next.js](https://img.shields.io/badge/Next.js-15.2.0-black?logo=next.js)](https://nextjs.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.9.4-ef4444?logo=turborepo)](https://turbo.build/repo)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![ElysiaJS](https://img.shields.io/badge/ElysiaJS-Backend-f38bb4)](https://elysiajs.com/)

**Pilly**는 AI 기반 의약품 정보 제공 및 맞춤형 복약 상담 서비스입니다. 사용자가 복용 중인 약물을 쉽게 이해하고 관리하며, 고도로 최적화된 모바일 퍼스트 웹 애플리케이션을 통해 개인화된 조언을 얻을 수 있도록 돕습니다.

[English README](./README.md)

---

## 🚀 주요 기능 (Key Features)

- **🤖 AI 상담 (Chat):** Gemini 3.1 Flash 모델 기반의 문맥 인식 맞춤형 복약 상담.
- **🔍 의약품 검색:** 공공 데이터 API 연동을 통한 상세한 의약품 정보 검색.
- **👁️ Vision AI 이미지 분석:** 처방전이나 약 봉투 이미지를 업로드하여 약품명, 용량, 복용 빈도를 자동 추출.
- **🗣️ TTS (Text-to-Speech):** 접근성 향상을 위한 AI 상담 결과 음성 읽어주기 기능.
- **📊 어드민 대시보드:** 포괄적인 사용자 관리 및 서비스 모니터링 시스템.

## 🛠️ 기술 스택 (Tech Stack)

Pilly는 코드 공유와 빠른 이터레이션을 보장하기 위해 고성능 모노레포 구조로 구축되었습니다.

- **Monorepo Management:** Turborepo, Bun Workspaces
- **Frontend:** Next.js 15 (App Router), Tailwind CSS, Shadcn/UI, Framer Motion
- **Backend:** Elysia.js, Drizzle ORM, PostgreSQL
- **AI Integration:** Google AI SDK (Gemini 3.1 Flash)
- **Testing:** Vitest (with happy-dom), Playwright (E2E)

## 💎 기술적 우수성 (Technical Excellence)

우리는 견고하고 확장 가능하며 접근성이 뛰어난 애플리케이션을 제공하는 데 자부심을 가집니다:

- **100% Type Safety:** 코드베이스 전체에서 `as any` 및 `@ts-ignore`를 완전히 제거하여 완벽한 타입 무결성 달성.
- **Performance Optimized:**
  - Core Web Vitals (LCP/CLS) 엄격한 최적화.
  - `next/dynamic`을 활용한 무거운 UI 컴포넌트(모달, 시트) 지연 로딩 적용.
  - Layout Shift 방지를 위한 로컬 폰트(Pretendard) 최적화.
- **Responsive Design & Accessibility (A11y):**
  - 모바일 퍼스트(Mobile-First) 설계.
  - 모바일 브라우저에 정확히 대응하는 `100dvh` 동적 뷰포트 적용.
  - `env(safe-area-inset-bottom)`를 활용한 안전 영역(Safe Area) 처리.
  - 접근성 훼손(`maximumScale: 1` 사용 안 함) 없이, 모든 입력 필드에 `16px`(`text-base`)을 강제하여 iOS Safari 자동 줌(Zoom) 버그 원천 차단.
- **Clean Code Architecture:** 'Clean Code JavaScript' 원칙 준수 및 ESLint, SonarJS 정적 분석을 통한 지속적인 코드 품질 관리.

## 📁 프로젝트 구조 (Project Structure)

```text
pilly/
├── apps/
│   ├── api/        # Elysia.js 백엔드 애플리케이션
│   └── web/        # Next.js 15 프론트엔드 애플리케이션
├── packages/
│   ├── ai-core/    # 공유 AI 유틸리티 및 Gemini 연동
│   ├── types/      # 공유 TypeScript 타입 정의
│   └── utils/      # 공유 유틸리티 함수
├── package.json
└── turbo.json
```

## 🏁 시작하기 (Getting Started)

### 요구 사항

- [Bun](https://bun.sh/) (v1.2+)
- PostgreSQL 데이터베이스

### 설치 및 실행

1. **저장소 클론:**

   ```bash
   git clone https://github.com/your-username/pilly.git
   cd pilly
   ```

2. **의존성 설치:**

   ```bash
   bun install
   ```

3. **환경 변수 설정:**
   예제 파일을 복사하여 필요한 환경 변수(Database URL, API Key 등)를 입력하세요.

   ```bash
   cp .env.example .env
   # apps/api 및 apps/web 내부의 .env 파일도 필요에 따라 설정합니다.
   ```

4. **데이터베이스 마이그레이션:**

   ```bash
   cd apps/api
   bun run db:push
   ```

5. **개발 서버 실행:**
   루트 디렉토리에서 프론트엔드와 백엔드를 동시에 실행합니다.

   ```bash
   bun run dev
   ```

   - Web App: http://localhost:3000
   - API Server: http://localhost:4000

## 📄 라이선스 (License)

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 LICENSE 파일을 참고하세요.
