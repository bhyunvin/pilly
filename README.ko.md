# 💊 Pilly

[![Bun](https://img.shields.io/badge/Bun-1.4.4-black?logo=bun)](https://bun.sh/)
[![Next.js](https://img.shields.io/badge/Next.js-16.4.6-black?logo=next.js)](https://nextjs.org/)
[![Rust](https://img.shields.io/badge/Rust-Edition_2024-000000?logo=rust)](https://www.rust-lang.org/)
[![Axum](https://img.shields.io/badge/Axum-0.8-black?logo=rust)](https://github.com/tokio-rs/axum)
[![Apache Iggy](https://img.shields.io/badge/Apache_Iggy-0.12-ff6600)](https://iggy.apache.org/)
<br />
[![Turborepo](https://img.shields.io/badge/Turborepo-2.11.12-ef4444?logo=turborepo)](https://turbo.build/repo)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0.2-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.3.5-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)
[![SQLx](<https://img.shields.io/badge/SQLx-0.9_(PostgreSQL)-336791?logo=postgresql>)](https://github.com/launchbadge/sqlx)
[![Vitest](https://img.shields.io/badge/Vitest-5.1.0-6e9f18?logo=vitest)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.65.1-2ead33?logo=playwright)](https://playwright.dev/)

**Pilly**는 AI 기반 의약품 정보 제공 및 맞춤형 복약 상담 서비스입니다. 고성능 **Rust + Apache Iggy** 백엔드와 모바일 퍼스트로 최적화된 **Next.js** 웹 애플리케이션을 통해 사용자가 복용 중인 약물을 쉽게 이해하고 안전하게 관리할 수 있도록 돕습니다.

[English README](./README.md)

---

## 🚀 주요 기능 (Key Features)

- **🤖 AI 상담 (Chat):** Google Gemini(`gemini-3.8-flash`) SSE 스트리밍 및 Function Calling 기반의 문맥 인식 맞춤형 복약 상담.
- **🔍 의약품 검색 및 동기화:** 공공데이터 API 연동을 통한 상세 의약품 검색 및 Rust 카탈로그 동기화 바이너리(`sync_pills`)·스케줄러 제공.
- **👁️ Vision AI 이미지 분석:** 처방전이나 약 봉투 이미지를 업로드하여 약품명, 용량, 복용 빈도를 자동 추출.
- **⚡ 비동기 이벤트 스트리밍:** **Apache Iggy**를 활용한 사용자 활동 로그, 검색 통계, 관리자 감사 로그 및 배치 작업 비동기 처리.
- **🗣️ TTS (Text-to-Speech):** 접근성 향상을 위한 AI 상담 결과 음성 읽어주기 기능.
- **📊 어드민 대시보드:** 포괄적인 사용자 관리, 탈퇴 회원 처리 및 서비스 모니터링 시스템.

## 🛠️ 기술 스택 (Tech Stack)

Pilly는 Rust 기반 고성능 백엔드와 Next.js 프론트엔드가 공존하는 모노레포 구조로 구축되었습니다.

- **Monorepo Management:** Turborepo, Bun Workspaces
- **Frontend (`apps/web`):** Next.js 16 (App Router), React 19, Tailwind CSS v4, Shadcn/UI (`@base-ui/react`), Zustand, Better Auth
- **Backend (`apps/api`):** Rust (Edition 2024), Axum 0.8, Tokio, Tower HTTP, SQLx 0.8 (PostgreSQL 17), `mimalloc`, `moka`, `dashmap`
- **Message Streaming:** Apache Iggy 0.6 (`iggy-server`)
- **AI Integration:** Google Gemini API (`gemini-3.8-flash` SSE 스트리밍 & Vision)
- **Testing & Quality:** Vitest (`happy-dom` / `jsdom`), Playwright + `@axe-core/playwright`, Biome, Clippy

## 💎 기술적 우수성 (Technical Excellence)

- **고성능 Rust & Apache Iggy 아키텍처:**
  - `mimalloc` 전역 메모리 할당자와 `moka`/`dashmap` 인메모리 캐시를 결합한 비동기 Axum API 서버.
  - Apache Iggy(`pilly-events` 스트림)를 통한 사용자 활동, 검색 통계, 관리자 감사 로그 및 주기적 동기화의 논블로킹 비동기 처리.
  - SQLx(`tls-rustls`) 기반 PostgreSQL 쿼리 및 안전한 DB 풀링.
- **최신 웹 보안 (Modern Web Security):**
  - 외부 CDN 리소스에 Subresource Integrity(`sha384`), `crossOrigin="anonymous"`, `referrerPolicy="no-referrer"`를 적용하고, 문서 레벨 `strict-origin-when-cross-origin` Referrer 정책을 설정.
  - AI 마크다운 렌더링 시 네이티브 Sanitizer API(`Element.prototype.setHTML`)를 우선 사용하고, 미지원 브라우저에서만 `DOMPurify`를 동적으로 지연 로드(Lazy-loading)하는 폴백 적용.
  - 백엔드 JWT 인증 및 AES-256-GCM 암호화 적용.
- **성능, 반응형 디자인 및 접근성 (Performance & A11y):**
  - Core Web Vitals 최적화, `next/dynamic` 기반 모달/시트 지연 로딩, Pretendard 웹폰트 프리로드.
  - 모바일 퍼스트 설계, `100dvh` 동적 뷰포트, `env(safe-area-inset-bottom)` 안전 영역 처리, `16px`(`text-base`) 입력 필드를 통한 iOS Safari 자동 줌 방지(`maximumScale: 1` 미사용).
  - `<meta name="color-scheme" content="light dark">` 및 `:root`/`.light`/`.dark`의 CSS `color-scheme` 적용으로 FOUC를 방지하고 시스템·사용자 테마 전환에 맞춰 네이티브 브라우저 UI 동기화.
- **코드 품질 및 정적 분석:**
  - TypeScript/React 영역의 Biome, Prettier와 Rust 영역의 `cargo fmt`, `cargo clippy -- -D warnings`를 통한 일관된 품질 관리.

## 📁 프로젝트 구조 (Project Structure)

```text
pilly/
├── apps/
│   ├── api/                 # Rust 백엔드 (Axum + SQLx + Apache Iggy)
│   │   ├── src/
│   │   │   ├── bin/         # sync_pills CLI 바이너리
│   │   │   ├── db/          # PostgreSQL 연결 및 쿼리
│   │   │   ├── mq/          # Apache Iggy 프로듀서/컨슈머 (PillyEvent)
│   │   │   ├── routes/      # Axum HTTP 및 SSE 엔드포인트
│   │   │   └── main.rs      # pilly-api 서버 엔트리포인트
│   │   ├── Cargo.toml
│   │   └── Dockerfile       # 멀티 스테이지 빌드 (pilly-api + iggy-server)
│   └── web/                 # Next.js 16 App Router 프론트엔드
├── packages/
│   ├── types/               # 공유 TypeScript 타입 정의
│   └── utils/               # 공유 유틸리티 함수
├── docker-compose.yml       # PostgreSQL 17 (local-db 프로필) 및 Apache Iggy
├── package.json
└── turbo.json
```

## 🏁 시작하기 (Getting Started)

### 요구 사항

- [Bun](https://bun.sh/) (v1.3+)
- [Rust](https://www.rust-lang.org/) (1.85+, Edition 2024)
- Docker & Docker Compose (또는 로컬 PostgreSQL 17 및 `iggy-server`)

### 설치 및 실행

1. **저장소 클론:**

   ```bash
   git clone https://github.com/your-username/pilly.git
   cd pilly
   ```

2. **JavaScript / 워크스페이스 의존성 설치:**

   ```bash
   bun install
   ```

3. **환경 변수 설정:**
   각 앱의 예제 파일을 복사하여 필요한 환경 변수(`DB_*`, `JWT_SECRET`, `ENCRYPTION_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` 등)를 입력합니다.

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

4. **인프라 실행 (Apache Iggy 및 선택적 로컬 PostgreSQL):**

   ```bash
   # 외부(Neon 등) PostgreSQL 사용 시 Apache Iggy만 실행
   bun run docker:iggy

   # 로컬 PostgreSQL 17과 Apache Iggy를 함께 실행
   docker compose --profile local-db up -d
   ```

5. **개발 서버 실행:**

   ```bash
   # Iggy + Rust API + Next.js Web 일괄 실행
   bun run dev:all

   # 또는 Turborepo로 Next.js Web + Rust API 동시 실행
   bun run dev
   ```

   - **Web App:** http://localhost:3000
   - **Rust API Server:** http://localhost:3001
   - **Apache Iggy (TCP / HTTP):** `127.0.0.1:8090` / `http://localhost:8080`

## 🦀 Rust + Apache Iggy 백엔드 (`apps/api`)

### 주요 명령어

```bash
# API 서버 릴리즈 모드 실행
cd apps/api && cargo run --release --bin pilly-api

# 공공데이터 의약품 카탈로그 PostgreSQL 동기화
bun run sync:pills

# All-in-One 컨테이너 빌드 및 실행 (pilly-api + iggy-server)
bun run docker:api
```

### 품질 검사 및 부하 테스트

```bash
# 전체 포맷팅 및 린트 검사 (Prettier, ESLint, cargo fmt, cargo clippy)
bun run ready

# 워크스페이스 테스트 실행
bun run test

# oha를 이용한 헬스 체크 부하 테스트 (10,000 요청, 동시 200 연결)
oha -n 10000 -c 200 http://localhost:3001/health
```

## 📄 라이선스 (License)

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 LICENSE 파일을 참고하세요.
