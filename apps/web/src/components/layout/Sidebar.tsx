'use client';

import {
  Check,
  Edit2,
  HelpCircle,
  Home,
  LogOut,
  MessageCircle,
  MessageSquare,
  Pill,
  Search,
  ShieldAlert,
  Trash2,
  User,
  UserMinus,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { ChatSession } from 'types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { clearAuthTokenCache, useApi } from '@/hooks/useApi';
import { authClient } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { logger } from '@/utils/logger';

interface SidebarProps {
  readonly onNavigate?: () => void;
}

const NAV_ITEMS = [
  { label: '홈', icon: Home, href: '/' },
  { label: '의약품 검색', icon: Search, href: '/search' },
  { label: '복약 관리', icon: Pill, href: '/medications' },
  { label: '새 상담 시작', icon: MessageCircle, href: '/chat' },
  { label: '1:1 문의', icon: HelpCircle, href: '/inquiry' },
  { label: '내 프로필', icon: User, href: '/profile' },
] as const;

const ADMIN_NAV_ITEMS = [
  {
    label: '사용자 관리',
    icon: ShieldAlert,
    href: '/admin/users',
    activeClass: 'bg-primary/10 text-primary border-l-4 border-primary rounded-l-none',
  },
  {
    label: '1:1 문의 관리',
    icon: MessageSquare,
    href: '/admin/inquiries',
    activeClass: 'bg-primary/10 text-primary border-l-4 border-primary rounded-l-none',
  },
  {
    label: '탈퇴 예정자 관리',
    icon: UserMinus,
    href: '/admin/withdrawals',
    activeClass: 'bg-destructive/10 text-destructive border-l-4 border-destructive rounded-l-none',
  },
] as const;

/**
 * @description 데스크톱 사이드바 및 모바일 드로어에서 공용으로 사용하는 내비게이션 컴포넌트입니다.
 * 주요 서비스 메뉴 이동, 최근 채팅 세션 목록 조회·제목 수정·삭제, 관리자 메뉴 및 로그아웃 기능을 제공합니다.
 *
 * @param props - 내비게이션 클릭 콜백 (모바일 Sheet 닫기용)
 * @returns 서비스 내비게이션 및 세션 목록을 포함한 사이드바를 반환합니다.
 */
export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { apiFetch } = useApi();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const fetchProfile = useCallback(async (): Promise<void> => {
    try {
      const { data: sessionData } = await authClient.getSession();
      if (!sessionData) {
        setIsAuthenticated(false);
        setIsAdmin(false);
        return;
      }

      setIsAuthenticated(true);
      const response = await apiFetch('/profile');
      if (!response.ok) return;
      const result = await response.json();
      if (result.success && result.data) {
        setIsAdmin(result.data.role === 'ADMIN');
      }
    } catch (err) {
      logger.error({ err }, '프로필 조회 중 오류 발생');
    }
  }, [apiFetch]);

  const fetchSessions = useCallback(async (): Promise<void> => {
    try {
      const { data: sessionData } = await authClient.getSession();
      if (!sessionData) return;

      const res = await apiFetch('/chat/sessions');
      if (res.ok) {
        const data = (await res.json()) as ChatSession[];
        setSessions(data);
      }
    } catch (err) {
      logger.error({ err }, '채팅 세션 목록 조회 중 오류 발생');
    }
  }, [apiFetch]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchProfile();
      void fetchSessions();
    });

    globalThis.addEventListener('refresh-sessions', fetchSessions);
    return () => globalThis.removeEventListener('refresh-sessions', fetchSessions);
  }, [fetchProfile, fetchSessions]);

  const handleStartEdit = (session: ChatSession): void => {
    setEditingId(session.id);
    setEditTitle(session.title || '새로운 상담');
  };

  const handleSaveEdit = async (id: number): Promise<void> => {
    if (!editTitle.trim()) return;

    const oldSessions = [...sessions];
    setSessions(sessions.map((s) => (s.id === id ? { ...s, title: editTitle } : s)));
    setEditingId(null);

    try {
      const res = await apiFetch(`/chat/sessions/${id}/title`, {
        method: 'PATCH',
        body: JSON.stringify({ title: editTitle }),
      });
      if (!res.ok) throw new Error('수정 실패');
    } catch (err) {
      logger.error({ err }, '세션 제목 수정 실패');
      setSessions(oldSessions);
      alert('제목 수정 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteSession = async (id: number): Promise<void> => {
    if (!confirm('이 상담 세션을 삭제하시겠습니까?')) return;

    const oldSessions = [...sessions];
    setSessions((prev) => prev.filter((s) => s.id !== id));

    try {
      const res = await apiFetch(`/chat/sessions/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('삭제 실패');
      globalThis.dispatchEvent(new Event('refresh-sessions'));
      if (pathname === `/chat/${id}`) {
        router.replace('/chat');
      }
    } catch (err) {
      logger.error({ err }, '세션 삭제 실패');
      setSessions(oldSessions);
      alert('채팅 세션 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleLogout = async (): Promise<void> => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      clearAuthTokenCache();
      await authClient.signOut();
      onNavigate?.();
      router.replace('/login');
    } catch (err) {
      logger.error({ err }, '로그아웃 처리 중 오류 발생');
      alert('로그아웃 중 오류가 발생했습니다.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <aside className="h-full w-full bg-background flex flex-col">
      <div className="flex h-16 items-center justify-between pl-6 pr-4 border-b shrink-0">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 font-bold text-xl text-green-800 dark:text-green-400"
        >
          <Pill className="rotate-45" aria-hidden="true" />
          <span>Pilly</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto" aria-label="주 메뉴">
        <div className="px-3 py-4">
          <p
            className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            aria-hidden="true"
          >
            Menu
          </p>
          <ul className="space-y-1">
            {NAV_ITEMS.map(({ label, icon: Icon, href }) => {
              const isActive = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                      isActive
                        ? 'bg-primary/15 text-green-900 dark:text-green-300'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon size={18} aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {isAdmin && (
            <div className="mt-4 pt-4 border-t">
              <p className="px-3 mb-2 text-xs font-semibold text-destructive uppercase tracking-wider">
                Admin Panel
              </p>
              <ul className="space-y-1">
                {ADMIN_NAV_ITEMS.map(({ label, icon: Icon, href, activeClass }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                        pathname === href
                          ? activeClass
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )}
                    >
                      <Icon size={18} aria-hidden="true" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-3 py-4 border-t">
          <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Recent Chats
          </p>
          <ul className="space-y-1">
            {sessions.length > 0 ? (
              sessions.map((session) => {
                const title = session.title || '새로운 상담';
                const isActive = pathname === `/chat/${session.id}`;
                const isEditing = editingId === session.id;

                return (
                  <li key={session.id} className="group relative">
                    {isEditing ? (
                      <div className="flex items-center gap-1 px-2 py-1">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(session.id)}
                          className="h-7 text-base md:text-xs"
                          autoFocus
                          aria-label="채팅 제목 수정"
                        />
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => handleSaveEdit(session.id)}
                          aria-label="저장"
                        >
                          <Check size={14} aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          aria-label="취소"
                        >
                          <X size={14} aria-hidden="true" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Link
                          href={`/chat/${session.id}`}
                          onClick={onNavigate}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 pr-14 text-xs font-medium transition-colors',
                            isActive
                              ? 'bg-accent text-accent-foreground'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          <MessageCircle size={14} className="shrink-0" aria-hidden="true" />
                          <span className="truncate flex-1">{title}</span>
                        </Link>
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-80 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleStartEdit(session)}
                            aria-label={`${title} 제목 수정`}
                          >
                            <Edit2 size={12} aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleDeleteSession(session.id)}
                            aria-label={`${title} 삭제`}
                            className="hover:text-destructive"
                          >
                            <Trash2 size={12} aria-hidden="true" />
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })
            ) : (
              <li>
                <p className="px-3 py-2 text-xs text-muted-foreground italic">
                  상담 내역이 없습니다.
                </p>
              </li>
            )}
          </ul>
        </div>
      </nav>

      {isAuthenticated && (
        <div className="p-3 border-t shrink-0">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label="로그아웃"
          >
            <LogOut size={18} aria-hidden="true" />
            <span>{isLoggingOut ? '로그아웃 중...' : '로그아웃'}</span>
          </Button>
        </div>
      )}
    </aside>
  );
}
