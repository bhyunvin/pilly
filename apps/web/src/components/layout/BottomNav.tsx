'use client';

import Link from 'next/link';
import { Home, Search, MessageCircle, User } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { label: '홈', icon: Home, href: '/' },
    { label: '검색', icon: Search, href: '/search' },
    { label: '채팅', icon: MessageCircle, href: '/chat' },
    { label: '프로필', icon: User, href: '/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 z-50 w-full bg-background border-t md:hidden min-h-16 pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-16 items-center justify-around">
        {navItems.map(({ label, icon: Icon, href }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full gap-1 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
