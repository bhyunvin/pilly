'use client';

import { Bot, Loader2, MessageCircle, MessageSquarePlus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { ChatSession } from 'types';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { logger } from '@/utils/logger';

/**
 * AI 복약 상담 세션 목록 페이지 컴포넌트입니다.
 * 사용자의 과거 상담 기록을 조회하고 새로운 상담 세션을 시작하거나 기존 세션을 삭제할 수 있습니다.
 *
 * @returns 채팅 세션 목록 페이지 렌더링 결과
 */
export default function ChatSessionsPage(): React.ReactNode {
  const router = useRouter();
  const { apiFetch } = useApi();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch('/chat/sessions');
      if (!res.ok) {
        throw new Error('세션 로드 실패');
      }
      const result = (await res.json()) as ChatSession[];
      setSessions(result);
    } catch (err) {
      logger.error({ err }, '상담 내역 로드 중 오류 발생');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchSessions();
    });
    globalThis.addEventListener('refresh-sessions', fetchSessions);
    return () => globalThis.removeEventListener('refresh-sessions', fetchSessions);
  }, [fetchSessions]);

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
        globalThis.dispatchEvent(new Event('refresh-sessions'));
        router.push(`/chat/${result.data.id}`);
      }
    } catch (err) {
      logger.error({ err }, '세션 생성 중 오류 발생');
      setIsCreating(false);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    if (deletingId !== null || !confirm('이 상담 세션을 삭제하시겠습니까?')) return;

    setDeletingId(sessionId);
    try {
      const res = await apiFetch(`/chat/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('세션 삭제 실패');
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      globalThis.dispatchEvent(new Event('refresh-sessions'));
    } catch (err) {
      logger.error({ err }, '세션 삭제 중 오류 발생');
      alert('채팅 세션 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto h-[calc(100dvh-140px)] flex flex-col relative">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="text-primary" aria-hidden="true" /> AI 복약 상담 내역
          </h1>
          <p className="text-sm text-muted-foreground">
            이전 상담 기록을 확인하거나 새 상담을 시작하세요.
          </p>
        </div>
        <Button
          type="button"
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
          sessions.map((session) => {
            const title = session.title || '새로운 상담';
            const displayDate = session.updatedAt || session.createdAt;
            return (
              <li key={session.id} className="block list-none relative">
                <Card
                  className="cursor-pointer hover:bg-muted/50 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none pr-10"
                  onClick={() => router.push(`/chat/${session.id}`)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/chat/${session.id}`);
                    }
                  }}
                  aria-label={`${title} 상담방 입장`}
                >
                  <CardHeader className="p-4 flex flex-row items-center gap-4">
                    <div className="bg-primary/10 p-3 rounded-full text-primary">
                      <MessageCircle size={20} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">{title}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {displayDate
                          ? new Date(displayDate).toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </CardDescription>
                    </div>
                  </CardHeader>
                </Card>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  disabled={deletingId === session.id}
                  className="absolute top-3 right-3 text-muted-foreground hover:text-destructive"
                  aria-label={`${title} 세션 삭제`}
                >
                  {deletingId === session.id ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 size={16} aria-hidden="true" />
                  )}
                </Button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
