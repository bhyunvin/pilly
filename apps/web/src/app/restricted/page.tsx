'use client';

import { useEffect, useState, useCallback } from 'react';
import { logger } from '@/utils/logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, LogOut, MessageCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth';
import { format } from 'date-fns';

interface RestrictionInfo {
  status: 'ACTIVE' | 'RESTRICTED';
  restrictedReason?: string;
  restrictedAt?: string;
}

/**
 * 이용 제한 안내 페이지 컴포넌트입니다.
 * 운영 정책에 따라 서비스 이용이 제한된 사용자에게 제한 사유와 일시를 안내합니다.
 *
 * @returns 이용 제한 안내 페이지 렌더링 결과
 */
export default function RestrictedPage(): React.ReactNode {
  const [restrictionInfo, setRestrictionInfo] = useState<RestrictionInfo | null>(null);

  /**
   * 서버로부터 사용자의 현재 이용 제한 정보를 비동기로 조회합니다.
   *
   * @async
   */
  const fetchRestrictionInfo = useCallback(async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/profile/restriction`,
      );
      const result = await response.json();
      if (result.success) {
        setRestrictionInfo(result.data);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to fetch restriction info');
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      fetchRestrictionInfo();
    });
    return () => cancelAnimationFrame(frame);
  }, [fetchRestrictionInfo]);

  /**
   * 로그아웃을 처리하고 로그인 페이지로 이동합니다.
   *
   * @async
   */
  const handleLogout = async () => {
    await authClient.signOut();
    globalThis.location.href = '/login';
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-destructive/20 shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center text-destructive mb-4">
            <ShieldAlert size={32} />
          </div>
          <CardTitle className="text-2xl font-bold text-destructive">
            계정 이용이 제한되었습니다
          </CardTitle>
          <CardDescription>
            운영 정책에 따라 해당 계정의 서비스 이용이 일시적으로 제한되었습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <div className="bg-muted/50 p-4 rounded-lg space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                제한 사유
              </p>
              <p className="text-sm font-medium">
                {restrictionInfo?.restrictedReason || '정책 위반 또는 비정상적인 활동 감지'}
              </p>
            </div>
            {restrictionInfo?.restrictedAt && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  제한 일시
                </p>
                <p className="text-sm font-medium">
                  {format(new Date(restrictionInfo.restrictedAt), 'yyyy년 MM월 dd일 HH:mm')}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => (globalThis.location.href = '/inquiry')}
            >
              <MessageCircle size={18} />
              이의 제기 및 문의하기
            </Button>
            <Button
              variant="ghost"
              className="w-full gap-2 text-muted-foreground"
              onClick={handleLogout}
            >
              <LogOut size={18} />
              다른 계정으로 로그인
            </Button>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-accent/30 p-3 rounded">
            <Info size={14} className="shrink-0 mt-0.5" />
            <p>
              Pilly는 안전한 커뮤니티 환경을 위해 노력하고 있습니다. 본 조치에 대해 궁금한 점이
              있으시면 고객센터로 문의해 주세요.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
