'use client';

import { useState, type SyntheticEvent } from 'react';
import { logger } from '@/utils/logger';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * 초기 프로필 설정 페이지 컴포넌트입니다.
 * 회원가입 직후 사용자가 서비스에서 사용할 닉네임을 설정하는 기능을 제공합니다.
 *
 * @returns 프로필 설정 페이지 렌더링 결과
 */
export default function ProfileSetupPage(): React.ReactNode {
  const [nickname, setNickname] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  /**
   * 입력한 닉네임을 서버에 저장하여 프로필 설정을 완료합니다.
   *
   * @async
   * @param e - 폼 제출 이벤트 객체
   */
  const handleSetup = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // 1. 세션 확인
      const { data: sessionData } = await authClient.getSession();
      if (!sessionData) {
        setError('인증 세션이 만료되었습니다. 다시 로그인해 주세요.');
        return;
      }

      // 2. 백엔드 프로필 생성 API 호출
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/profile`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionData.session.id}`, // 실제 환경에 따라 세션 토큰 확인 필요
          },
          body: JSON.stringify({ nickname }),
        },
      );

      if (response.status === 409) {
        setError('이미 사용 중인 닉네임입니다.');
        return;
      }

      if (!response.ok) {
        throw new Error('프로필 설정 중 오류가 발생했습니다.');
      }

      // 3. 성공 시 홈으로 리다이렉트
      router.push('/');
    } catch (err) {
      logger.error({ err }, 'Profile setup error');
      setError('서버와의 통신 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">프로필 설정</CardTitle>
          <CardDescription>
            Pilly에서 사용할 닉네임을 입력해 주세요. (개인정보 보호를 위해 실명 사용을 권장하지
            않습니다.)
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSetup}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nickname">닉네임</Label>
              <Input
                id="nickname"
                className="text-base md:text-sm"
                placeholder="최소 2자 이상"
                required
                minLength={2}
                maxLength={40}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                disabled={isLoading}
              />
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          </CardContent>
          <CardFooter>
            <Button className="w-full h-11" type="submit" disabled={isLoading}>
              {isLoading ? '설정 중...' : '설정 완료'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
