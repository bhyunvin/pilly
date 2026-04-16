'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, MessageSquarePlus, MessageCircle, Loader2 } from 'lucide-react';

interface ChatSession {
  id: number;
  title: string;
  createdAt: string;
}

/**
 * AI 복약 상담 세션 목록 페이지 컴포넌트입니다.
 * 사용자의 과거 상담 기록을 조회하고 새로운 상담 세션을 시작할 수 있는 기능을 제공합니다.
 *
 * @returns {JSX.Element} 채팅 세션 목록 페이지 렌더링 결과
 */
export default function ChatSessionsPage() {
  const router = useRouter();
  const { apiFetch } = useApi();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  /**
   * 서버로부터 사용자의 모든 채팅 세션 목록을 비동기로 가져옵니다.
   *
   * @async
   * @function fetchSessions
   */
  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch('/chat/sessions');
      if (!res.ok) {
        throw new Error('세션 로드 실패');
      }
      const result = await res.json();
      setSessions(result);
    } catch (err) {
      console.error('상담 내역 로드 중 오류 발생:', err);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  /**
   * 새로운 AI 상담 세션을 생성하고 해당 세션 페이지로 이동합니다.
   *
   * @async
   * @function handleCreateSession
   */
  const handleCreateSession = async () => {
    if (isCreating) return;

    setIsCreating(true);
    try {
      const res = await apiFetch('/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: '새로운 상담' }),
      });

      if (!res.ok) {
        throw new Error('세션 생성 실패');
      }

      const result = await res.json();
      if (result.success) {
        router.push(`/chat/${result.data.id}`);
      }
    } catch (err) {
      console.error('세션 생성 중 오류 발생:', err);
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto h-[calc(100dvh-140px)] flex flex-col relative">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="text-primary" aria-hidden="true" /> AI 복약 상담 내역
          </h1>
          <p className="text-sm text-muted-foreground">
            이전 상담 기록을 확인하거나 새 상담을 시작하세요.
          </p>
        </div>
        <Button
          onClick={handleCreateSession}
          disabled={isCreating}
          className="gap-2 bg-primary text-primary-foreground font-bold hover:bg-primary/90"
          aria-label="새로운 상담 시작하기"
        >
          {isCreating ? (
            <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          ) : (
            <MessageSquarePlus size={16} aria-hidden="true" />
          )}
          새로운 상담 시작하기
        </Button>
      </div>

      <ul className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {sessions.length === 0 ? (
          <li className="col-span-full py-12 text-center text-muted-foreground border rounded-lg bg-muted/10">
            상담 내역이 없습니다. 새로운 상담을 시작해 보세요.
          </li>
        ) : (
          sessions.map((session) => (
            <li key={session.id} className="block list-none">
              <Card
                className="cursor-pointer hover:bg-muted/50 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                onClick={() => router.push(`/chat/${session.id}`)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    router.push(`/chat/${session.id}`);
                  }
                }}
                aria-label={`${session.title} 상담방 입장`}
              >
                <CardHeader className="p-4 flex flex-row items-center gap-4">
                  <div className="bg-primary/10 p-3 rounded-full text-primary">
                    <MessageCircle size={20} aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{session.title}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {new Date(session.createdAt).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
