'use client';

import { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import Link from 'next/link';
import {
  Home,
  Search,
  MessageCircle,
  User,
  Pill,
  Edit2,
  Check,
  X,
  ShieldAlert,
  UserMinus,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { authClient } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/theme-toggle';

interface ChatSession {
  id: number;
  title: string;
  createdAt: string;
}

/**
 * @description 데스크톱 환경에서 화면 왼쪽에 고정되는 사이드바 내비게이션 컴포넌트입니다.
 * 주요 서비스 메뉴 이동, 최근 채팅 세션 목록 조회 및 관리(제목 수정),
 * 관리자 계정의 경우 관리자 전용 메뉴(사용자 관리 등) 노출 기능을 수행합니다.
 *
 * @returns 서비스 내비게이션 및 세션 목록을 포함한 사이드바를 반환합니다.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const navItems = [
    { label: '홈', icon: Home, href: '/' },
    { label: '의약품 검색', icon: Search, href: '/search' },
    { label: '새 상담 시작', icon: MessageCircle, href: '/chat' },
    { label: '내 프로필', icon: User, href: '/profile' },
  ];

  /**
   * @description 현재 로그인한 사용자의 프로필 정보를 조회하여 관리자 권한 여부를 확인합니다.
   * @async
   */
  const fetchProfile = async (): Promise<void> => {
    try {
      const { data: sessionData } = await authClient.getSession();
      if (!sessionData) return;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/profile`,
        {
          headers: {
            Authorization: `Bearer ${sessionData.session.id}`,
          },
        },
      );
      const result = await response.json();
      if (result.success && result.data) {
        setIsAdmin(result.data.role === 'ADMIN');
      }
    } catch (err) {
      logger.error({ err }, 'Error fetching profile');
    }
  };

  /**
   * @description 최근 생성된 채팅 세션 목록을 API를 통해 조회합니다.
   * @async
   */
  const fetchSessions = async (): Promise<void> => {
    try {
      const { data: sessionData } = await authClient.getSession();
      if (!sessionData) return;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/chat/sessions`,
        {
          headers: { Authorization: `Bearer ${sessionData.session.id}` },
        },
      );
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      logger.error({ err }, 'Error fetching sessions');
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchSessions();

    globalThis.addEventListener('refresh-sessions', fetchSessions);
    return () => globalThis.removeEventListener('refresh-sessions', fetchSessions);
  }, []);

  /**
   * @description 특정 채팅 세션의 제목 수정을 시작합니다.
   * @param session - 수정할 세션 객체
   */
  const handleStartEdit = (session: ChatSession): void => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  /**
   * @description 수정된 세션 제목을 API를 통해 저장합니다. 낙관적 업데이트를 적용합니다.
   * @async
   * @param id - 수정할 세션의 ID
   */
  const handleSaveEdit = async (id: number): Promise<void> => {
    if (!editTitle.trim()) return;

    const oldSessions = [...sessions];
    setSessions(sessions.map((s) => (s.id === id ? { ...s, title: editTitle } : s)));
    setEditingId(null);

    try {
      const { data: sessionData } = await authClient.getSession();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/chat/sessions/${id}/title`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionData?.session.id}`,
          },
          body: JSON.stringify({ title: editTitle }),
        },
      );
      if (!res.ok) throw new Error('수정 실패');
    } catch (err) {
      logger.error({ err }, 'Failed to update session title:');
      setSessions(oldSessions);
      alert('제목 수정 중 오류가 발생했습니다.');
    }
  };

  return (
    <aside className="h-full w-full bg-background flex flex-col">
      <div className="flex h-16 items-center justify-between px-8 border-b shrink-0">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-xl text-green-800 dark:text-green-400"
        >
          <Pill className="rotate-45" aria-hidden="true" />
          <span>Pilly</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <div className="px-3 py-4">
          <p
            className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            aria-hidden="true"
          >
            Menu
          </p>
          <ul className="space-y-1">
            {navItems.map(({ label, icon: Icon, href }) => {
              const isActive = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                      isActive
                        ? 'bg-primary/15 text-green-900 dark:text-green-300'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
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
                <li>
                  <Link
                    href="/admin/users"
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                      pathname === '/admin/users'
                        ? 'bg-primary/10 text-primary border-l-4 border-primary rounded-l-none'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <ShieldAlert size={18} aria-hidden="true" />
                    사용자 관리
                  </Link>
                </li>
                <li>
                  <Link
                    href="/admin/withdrawals"
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                      pathname === '/admin/withdrawals'
                        ? 'bg-destructive/10 text-destructive border-l-4 border-destructive rounded-l-none'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <UserMinus size={18} aria-hidden="true" />
                    탈퇴 예정자 관리
                  </Link>
                </li>
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
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => handleSaveEdit(session.id)}
                          aria-label="저장"
                        >
                          <Check size={14} aria-hidden="true" />
                        </Button>
                        <Button
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
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                            isActive
                              ? 'bg-accent text-accent-foreground'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          <MessageCircle size={14} className="shrink-0" aria-hidden="true" />
                          <span className="truncate flex-1">{session.title}</span>
                        </Link>
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleStartEdit(session)}
                            aria-label={`${session.title} 제목 수정`}
                          >
                            <Edit2 size={12} aria-hidden="true" />
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

      <div className="mt-auto p-4 border-t">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[10px] text-muted-foreground/60 leading-tight">
            © 2026 Pilly AI Guide <br />
            All rights reserved.
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
