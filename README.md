# 💊 Pilly

[![Bun](https://img.shields.io/badge/Bun-1.3.13-black?logo=bun)](https://bun.sh/)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.4-black?logo=next.js)](https://nextjs.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.9.8-ef4444?logo=turborepo)](https://turbo.build/repo)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![ElysiaJS](https://img.shields.io/badge/ElysiaJS-1.4.28-f38bb4?logo=elysia)](https://elysiajs.com/)
<br />
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.2.2-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45.2-c5f74f?logo=drizzle)](https://orm.drizzle.team/)
[![Vitest](https://img.shields.io/badge/Vitest-4.1.2-6e9f18?logo=vitest)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.59.1-2ead33?logo=playwright)](https://playwright.dev/)

**Pilly** is an AI-powered medication information and consultation service. It empowers users to easily understand their medications, track their dosages, and receive personalized advice through a highly optimized, mobile-first web application.

[한국어 문서(Korean README)](./README.ko.md)

---

## 🚀 Key Features

- **🤖 AI Consultation (Chat):** Personalized, context-aware medication advice powered by Gemini 3.1 Flash.
- **🔍 Medication Search:** Comprehensive public API integration for searching detailed drug information.
- **👁️ Vision AI Analysis:** Upload an image of your medication to automatically extract name, dosage, and frequency.
- **🗣️ Text-to-Speech (TTS):** Accessible audio read-outs of AI consultation responses.
- **📊 Admin Dashboard:** Comprehensive user management and service monitoring.

## 🛠️ Tech Stack

Pilly is built as a high-performance monorepo, ensuring code sharing and rapid iteration.

- **Monorepo Management:** Turborepo, Bun Workspaces
- **Frontend:** Next.js 15 (App Router), Tailwind CSS, Shadcn/UI, Framer Motion
- **Backend:** Elysia.js, Drizzle ORM, PostgreSQL
- **AI Integration:** Google AI SDK (Gemini 3.1 Flash)
- **Testing:** Vitest (with happy-dom), Playwright (E2E)

## 💎 Technical Excellence

We pride ourselves on delivering a robust, scalable, and accessible application:

- **100% Type Safety:** Achieved absolute type integrity across the full stack by eliminating all `as any` and `@ts-ignore` assertions.
- **Performance Optimized:**
  - Strict adherence to Core Web Vitals (LCP/CLS).
  - Lazy loading of heavy UI components (modals, sheets) via `next/dynamic`.
  - Optimized local font loading (Pretendard) to prevent layout shifts.
- **Responsive Design & Accessibility (A11y):**
  - Mobile-First methodology.
  - Implementation of `100dvh` for accurate mobile viewport rendering.
  - Explicit safe-area handling (`env(safe-area-inset-bottom)`).
  - Prevention of iOS auto-zoom bugs by enforcing `16px` (`text-base`) base sizing on all input elements without compromising A11y (no `maximumScale: 1`).
- **Clean Code Architecture:** Strict adherence to 'Clean Code JavaScript' principles, continuously enforced by ESLint and SonarJS static analysis.

## 📁 Project Structure

```text
pilly/
├── apps/
│   ├── api/        # Elysia.js backend application
│   └── web/        # Next.js 15 frontend application
├── packages/
│   ├── ai-core/    # Shared AI utilities and Gemini integration
│   ├── types/      # Shared TypeScript definitions
│   └── utils/      # Shared utility functions
├── package.json
└── turbo.json
```

## 🏁 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.2+)
- PostgreSQL database

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-username/pilly.git
   cd pilly
   ```

2. **Install dependencies:**

   ```bash
   bun install
   ```

3. **Environment Setup:**
   Copy the example environment files and fill in your specific credentials (Database URL, API Keys, etc.).

   ```bash
   cp .env.example .env
   # You may also need to setup specific .env files in apps/api and apps/web
   ```

4. **Database Migration:**

   ```bash
   cd apps/api
   bun run db:push
   ```

5. **Start Development Server:**
   Run both the frontend and backend concurrently from the root:

   ```bash
   bun run dev
   ```

   - Web App: http://localhost:3000
   - API Server: http://localhost:4000

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
