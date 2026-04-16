'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '@/hooks/useApi';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';

/**
 * 계정 복구 페이지 컴포넌트입니다.
 * 탈퇴 유예 기간(30일) 중인 사용자가 자신의 탈퇴 상태를 확인하고 계정을 다시 활성화할 수 있는 기능을 제공합니다.
 *
 * @returns {JSX.Element} 계정 복구 페이지 렌더링 결과
 */
export default function RestorePage() {
  const router = useRouter();
  const { apiFetch } = useApi();
  const [deletedAt, setDeletedAt] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * 사용자 프로필을 비동기로 조회하여 탈퇴 여부와 정확한 탈퇴 일시를 확인합니다.
   *
   * @async
   * @function fetchProfile
   */
  const fetchProfile = useCallback(async () => {
    try {
      const response = await apiFetch('/profile');
      const result = await response.json();

      if (!result.success || !result.data) {
        throw new Error('프로필 정보 로드 실패');
      }

      // 탈퇴한 계정이 아닌 경우 홈으로 리다이렉트
      if (!result.data.deletedAt) {
        router.replace('/');
        return;
      }

      setDeletedAt(result.data.deletedAt);
    } catch (err) {
      console.error('프로필 로드 중 오류 발생:', err);
      // 인증 실패 등의 경우 로그인 페이지로 이동할 수 있음
    } finally {
      setIsLoading(false);
    }
  }, [router, apiFetch]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  /**
   * 탈퇴 진행 중인 계정의 복구 요청을 서버에 비동기로 수행합니다.
   *
   * @async
   */
  const handleRestore = async () => {
    if (isRestoring) return;

    setIsRestoring(true);
    try {
      const response = await apiFetch('/profile/restore', {
        method: 'POST',
      });

      if (response.ok) {
        alert('계정이 복구되었습니다. 다시 Pilly를 이용하실 수 있습니다.');
        router.replace('/');
        return;
      }

      alert('복구 처리 중 오류가 발생했습니다.');
    } catch (err) {
      console.error('계정 복구 중 오류 발생:', err);
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setIsRestoring(false);
    }
  };

  // 영구 삭제 예정일 계산 (탈퇴일로부터 30일 후)
  const GRACE_PERIOD_DAYS = 30;
  const scheduledDeletionDate = useMemo(
    () => (deletedAt ? addDays(new Date(deletedAt), GRACE_PERIOD_DAYS) : null),
    [deletedAt],
  );
  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <Loader2 className="animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-amber-200 shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-2">
            <AlertCircle size={32} className="text-amber-600" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl font-bold">회원 탈퇴 유예 기간입니다</CardTitle>
          <p className="text-muted-foreground text-sm">
            현재 회원 탈퇴 절차가 진행 중인 계정입니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-center">
            <p className="text-xs font-semibold text-amber-700 uppercase mb-1">영구 삭제 예정일</p>
            <p className="text-xl font-bold text-amber-900">
              {scheduledDeletionDate
                ? format(scheduledDeletionDate, 'yyyy년 MM월 dd일', { locale: ko })
                : '-'}
            </p>
            <p className="text-xs text-amber-600 mt-2">
              앞으로 30일 이내에 언제든지 계정을 복구할 수 있습니다.
            </p>
          </div>
          <p className="text-sm text-center text-muted-foreground">
            계정을 복구하시면 기존의 모든 데이터(상담 내역, 복약 기록 등)를 그대로 다시 이용하실 수
            있습니다.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            onClick={handleRestore}
            disabled={isRestoring}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isRestoring ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            계정 복구하기
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              authClient.signOut({ fetchOptions: { onSuccess: () => router.push('/') } })
            }
            className="w-full"
          >
            로그아웃
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
