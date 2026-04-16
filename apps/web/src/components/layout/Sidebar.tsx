'use client';

import { useState, useEffect } from 'react';
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

interface ChatSession {
  id: number;
  title: string;
  createdAt: string;
}

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

  const fetchProfile = async () => {
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
      console.error(err);
    }
  };

  const fetchSessions = async () => {
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
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchSessions();

    window.addEventListener('refresh-sessions', fetchSessions);
    return () => window.removeEventListener('refresh-sessions', fetchSessions);
  }, []);

  const handleStartEdit = (session: ChatSession) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const handleSaveEdit = async (id: number) => {
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
      console.error('Failed to update session title:', err);
      setSessions(oldSessions);
      alert('제목 수정 중 오류가 발생했습니다.');
    }
  };

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-[100dvh] w-64 border-r bg-background md:flex flex-col">
      <div className="flex h-16 items-center px-6 border-b">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-xl text-green-800 dark:text-green-400"
        >
          <Pill className="rotate-45" aria-hidden="true" />
          <span>Pilly</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <div className="space-y-1 px-3 py-4" role="list">
          <p
            className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            role="presentation"
          >
            Menu
          </p>
          {navItems.map(({ label, icon: Icon, href }) => {
            const isActive = pathname === href;
            return (
              <div key={href} role="listitem">
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
              </div>
            );
          })}

          {isAdmin && (
            <div className="mt-4 pt-4 border-t space-y-1" role="presentation">
              <p className="px-3 mb-2 text-xs font-semibold text-destructive uppercase tracking-wider">
                Admin Panel
              </p>
              <div role="listitem">
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
              </div>
              <div role="listitem">
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
              </div>
            </div>
          )}
        </div>

        <div className="px-3 py-4 border-t">
          <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Recent Chats
          </p>
          <div className="space-y-1" role="list">
            {sessions.length > 0 ? (
              sessions.map((session) => {
                const isActive = pathname === `/chat/${session.id}`;
                const isEditing = editingId === session.id;

                return (
                  <div key={session.id} className="group relative" role="listitem">
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
                  </div>
                );
              })
            ) : (
              <div role="listitem">
                <p className="px-3 py-2 text-xs text-muted-foreground italic">
                  상담 내역이 없습니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="p-4 border-t text-xs text-muted-foreground">© 2026 Pilly AI Guide</div>
    </aside>
  );
}
