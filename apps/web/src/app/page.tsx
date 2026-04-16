'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, MessageCircle, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';

/**
 * Pilly 메인 랜딩 페이지 컴포넌트입니다.
 * 서비스의 주요 특징(AI 상담, 의약품 검색, 개인화 관리 등)을 소개하고 각 기능으로의 진입점을 제공합니다.
 *
 * @description 로그인 여부에 따라 미들웨어에서 접근이 제한될 수 있습니다.
 * @returns 메인 페이지 렌더링 결과
 */
export default function Home(): React.ReactNode {
  const [mounted, setMounted] = useState(false);

  // 클라이언트 사이드 마운트 확인 (Hydration 안정성 확보)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex flex-col gap-12 py-8 md:py-16">
      {/* Hero Section */}
      <section className="text-center space-y-6 px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-sm font-medium animate-fade-in">
          <Zap size={14} />
          <span>초개인화 AI 복약 가이드 Pilly 출시</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-balance">
          당신의 건강을 위한 <br />
          <span className="text-green-700 dark:text-green-400">가장 똑똑한 복약 파트너</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
          AI 상담사와의 대화를 통해 복용 중인 약물의 정보를 확인하고, 나에게 꼭 맞는 건강 가이드를
          받아보세요.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link href="/chat">
            <Button size="lg" className="gap-2 h-12 px-8 text-base">
              AI 상담 시작하기 <ArrowRight size={18} />
            </Button>
          </Link>
          <Link href="/search">
            <Button size="lg" variant="outline" className="gap-2 h-12 px-8 text-base">
              의약품 검색 <Search size={18} />
            </Button>
          </Link>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4 max-w-6xl mx-auto w-full">
        <Card className="hover:shadow-lg transition-shadow border-green-100 dark:border-green-900/20">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-700 dark:text-green-400 mb-2">
              <MessageCircle size={24} />
            </div>
            <CardTitle>AI 복약 상담</CardTitle>
            <CardDescription>
              궁금한 약물의 효능, 부작용, 복용법을 질문하고 즉각적인 답변을 받으세요.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="hover:shadow-lg transition-shadow border-blue-100 dark:border-blue-900/20">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 mb-2">
              <Search size={24} />
            </div>
            <CardTitle>정밀 의약품 검색</CardTitle>
            <CardDescription>
              식약처 공공 데이터를 기반으로 수만 가지 의약품의 상세 정보를 정확하게 검색합니다.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="hover:shadow-lg transition-shadow border-purple-100 dark:border-purple-900/20">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-700 dark:text-purple-400 mb-2">
              <ShieldCheck size={24} />
            </div>
            <CardTitle>개인화 관리</CardTitle>
            <CardDescription>
              내가 복용 중인 약물을 등록하고 관리하며, 최적화된 건강 가이드를 제공받습니다.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </div>
  );
}
