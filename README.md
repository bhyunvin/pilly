# 💊 Pilly

[![Bun](https://img.shields.io/badge/Bun-1.4.4-black?logo=bun)](https://bun.sh/)
[![Next.js](https://img.shields.io/badge/Next.js-16.4.6-black?logo=next.js)](https://nextjs.org/)
[![Rust](https://img.shields.io/badge/Rust-Edition_2024-000000?logo=rust)](https://www.rust-lang.org/)
[![Axum](https://img.shields.io/badge/Axum-0.8-black?logo=rust)](https://github.com/tokio-rs/axum)
[![Apache Iggy](https://img.shields.io/badge/Apache_Iggy-0.6-ff6600)](https://iggy.apache.org/)
<br />
[![Turborepo](https://img.shields.io/badge/Turborepo-2.11.12-ef4444?logo=turborepo)](https://turbo.build/repo)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0.2-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.3.5-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)
[![SQLx](<https://img.shields.io/badge/SQLx-0.8_(PostgreSQL)-336791?logo=postgresql>)](https://github.com/launchbadge/sqlx)
[![Vitest](https://img.shields.io/badge/Vitest-5.1.0-6e9f18?logo=vitest)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.65.1-2ead33?logo=playwright)](https://playwright.dev/)

**Pilly** is an AI-powered medication information and consultation service. It empowers users to easily understand their medications, track their dosages, and receive personalized advice through a high-performance Rust + Apache Iggy backend and an optimized, mobile-first Next.js web application.

[한국어 문서 (Korean README)](./README.ko.md)

---

## 🚀 Key Features

- **🤖 AI Consultation (Chat):** Context-aware, SSE-streamed medication advice powered by Google Gemini (`gemini-3.8-flash`) with tool/function calling.
- **🔍 Medication Search & Catalog Sync:** Public drug API integration combined with a dedicated Rust sync binary (`sync_pills`) and background scheduler.
- **👁️ Vision AI Analysis:** Upload a prescription or medication packet image to automatically extract drug names, dosages, and frequencies.
- **⚡ Event-Driven Streaming:** Asynchronous processing of user activity logs, search statistics, admin audit trails, and catalog sync jobs via **Apache Iggy**.
- **🗣️ Text-to-Speech (TTS):** Accessible audio read-outs of AI consultation responses.
- **📊 Admin Dashboard:** User management, withdrawal processing, and service monitoring.

## 🛠️ Tech Stack

Pilly is built as a polyglot monorepo combining a Rust backend and a Next.js frontend:

- **Monorepo Management:** Turborepo, Bun Workspaces
- **Frontend (`apps/web`):** Next.js 16 (App Router), React 19, Tailwind CSS v4, Shadcn/UI (`@base-ui/react`), Zustand, Better Auth
- **Backend (`apps/api`):** Rust (Edition 2024), Axum 0.8, Tokio, Tower HTTP, SQLx 0.8 (PostgreSQL 17), `mimalloc`, `moka`, `dashmap`
- **Message Streaming:** Apache Iggy 0.6 (`iggy-server`)
- **AI Integration:** Google Gemini API (`gemini-3.8-flash` SSE & Vision), `packages/ai-core`
- **Testing & Quality:** Vitest (`happy-dom` / `jsdom`), Playwright + `@axe-core/playwright`, Biome, Clippy

## 💎 Technical Excellence

- **High-Performance Rust & Apache Iggy Architecture:**
  - Async Axum API server with `mimalloc` global allocator and `moka`/`dashmap` in-memory caching.
  - Non-blocking event streaming (`pilly-events`) through Apache Iggy for telemetry, audit logs, and scheduled sync tasks.
  - Compile-time checked PostgreSQL queries via SQLx (`tls-rustls`).
- **Modern Web Security:**
  - Subresource Integrity (`sha384`), `crossOrigin="anonymous"`, and `referrerPolicy="no-referrer"` on external CDN resources, paired with a document-level `strict-origin-when-cross-origin` referrer policy.
  - Native Sanitizer API (`Element.prototype.setHTML`) for AI markdown output with a dynamically lazy-loaded `DOMPurify` fallback for unsupported browsers.
  - JWT authentication and AES-256-GCM encryption on the backend.
- **Performance, Responsive Design & Accessibility (A11y):**
  - Core Web Vitals optimization, `next/dynamic` lazy loading for modals/sheets, and preloaded Pretendard webfont.
  - Mobile-first layout using `100dvh`, `env(safe-area-inset-bottom)`, and `16px` (`text-base`) input sizing to prevent iOS Safari auto-zoom without `maximumScale: 1`.
  - `<meta name="color-scheme" content="light dark">` and CSS `color-scheme` on `:root`/`.light`/`.dark` to prevent FOUC and synchronize native browser UI with theme toggles.
- **Clean Code & Strict Verification:**
  - Enforced across TypeScript and Rust via Biome, Prettier, `cargo fmt`, and `cargo clippy -- -D warnings`.

## 📁 Project Structure

```text
pilly/
├── apps/
│   ├── api/                 # Rust backend (Axum + SQLx + Apache Iggy)
│   │   ├── src/
│   │   │   ├── bin/         # sync_pills CLI binary
│   │   │   ├── db/          # PostgreSQL connection & queries
│   │   │   ├── mq/          # Apache Iggy producer/consumer (PillyEvent)
│   │   │   ├── routes/      # Axum HTTP & SSE endpoints
│   │   │   └── main.rs      # pilly-api server entrypoint
│   │   ├── Cargo.toml
│   │   └── Dockerfile       # Multi-stage build (pilly-api + iggy-server)
│   └── web/                 # Next.js 16 App Router frontend
├── packages/
│   ├── ai-core/             # Shared AI utilities & Gemini integration
│   ├── types/               # Shared TypeScript definitions
│   └── utils/               # Shared utility functions
├── docker-compose.yml       # PostgreSQL 17 (local-db profile) & Apache Iggy
├── package.json
└── turbo.json
```

## 🏁 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.3+)
- [Rust](https://www.rust-lang.org/) (1.85+, Edition 2024)
- Docker & Docker Compose (or local PostgreSQL 17 & `iggy-server`)

### Installation & Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-username/pilly.git
   cd pilly
   ```

2. **Install JavaScript/workspace dependencies:**

   ```bash
   bun install
   ```

3. **Environment setup:**
   Copy the example environment files for both apps and fill in your credentials (`DB_*`, `JWT_SECRET`, `ENCRYPTION_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, etc.).

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

4. **Start Infrastructure (Apache Iggy & optional local PostgreSQL):**

   ```bash
   # Start Apache Iggy only (when using external/Neon PostgreSQL)
   bun run docker:iggy

   # Or start both PostgreSQL 17 and Apache Iggy locally
   docker compose --profile local-db up -d
   ```

5. **Run Development Servers:**

   ```bash
   # Run Iggy + Rust API + Next.js Web together
   bun run dev:all

   # Or run via Turborepo (Next.js Web + Rust API)
   bun run dev
   ```

   - **Web App:** http://localhost:3000
   - **Rust API Server:** http://localhost:3001
   - **Apache Iggy (TCP / HTTP):** `127.0.0.1:8090` / `http://localhost:8080`

## 🦀 Rust + Apache Iggy Backend (`apps/api`)

### Useful Commands

```bash
# Run API server in release mode
cd apps/api && cargo run --release --bin pilly-api

# Sync public medication catalog to PostgreSQL
bun run sync:pills

# Build & run all-in-one container (pilly-api + iggy-server)
bun run docker:api
```

### Quality Checks & Load Testing

```bash
# Format & lint everything (Prettier, ESLint, cargo fmt, cargo clippy)
bun run ready

# Run workspace tests
bun run test

# Health check benchmark with oha (10,000 requests, 200 concurrent)
oha -n 10000 -c 200 http://localhost:3001/health
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
