'use client';

import { useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { Mail, ArrowRight } from 'lucide-react';
import { logger } from '@/utils/logger';
import { authClient } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * @description 인증 중심의 세련된 로그인 페이지 컴포넌트입니다.
 * 소셜 로그인(Google)과 이메일 매직 링크 방식을 지원하며,
 * 로그인 시 자동으로 약관에 동의하는 방식을 채택하여 사용자 경험을 개선했습니다.
 *
 * @returns 로그인 페이지 UI
 */
export default function LoginPage(): React.ReactNode {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  /**
   * 입력된 이메일 주소로 로그인용 매직 링크 발송을 요청합니다.
   * @async
   */
  const handleMagicLinkLogin = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: '/profile/setup',
      });

      if (error) {
        setMessage('로그인 요청 중 오류가 발생했습니다.');
      } else {
        setMessage('이메일로 전송된 링크를 확인해 주세요.');
      }
    } catch (err) {
      logger.error({ err }, 'Login request error');
      setMessage('네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Google 소셜 로그인을 수행합니다.
   */
  const handleGoogleLogin = async () => {
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/profile/setup',
      });
    } catch (err) {
      logger.error({ err }, 'Google login error');
      setMessage('Google 로그인 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[400px] space-y-6">
        <Card className="border-none shadow-xl bg-card/50 backdrop-blur-sm">
          <CardHeader className="space-y-2 text-center pb-8 border-b border-border/50">
            <CardTitle className="text-3xl font-extrabold tracking-tight">로그인</CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              스마트한 복약 관리의 시작, Pilly
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-8 space-y-6">
            {/* 소셜 로그인 영역 */}
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full h-12 text-base font-semibold gap-3 hover:bg-muted/50 transition-all border-muted-foreground/20"
                onClick={handleGoogleLogin}
                disabled={isLoading}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Google로 계속하기
              </Button>
            </div>

            {/* 구분선 */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">또는 이메일로 로그인</span>
              </div>
            </div>

            {/* 이메일 로그인 폼 */}
            <form onSubmit={handleMagicLinkLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="sr-only">
                  이메일 주소
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="pl-10 h-12 text-base transition-all focus:ring-primary"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-12 text-base font-bold transition-all active:scale-[0.98]"
                disabled={isLoading || !email}
              >
                {isLoading ? '요청 중...' : '매직 링크 발송'}
                {!isLoading && <ArrowRight className="ml-2 h-5 w-5" />}
              </Button>
            </form>

            {message && (
              <div
                className={`p-4 rounded-lg text-sm font-medium text-center animate-in fade-in slide-in-from-top-2 duration-300 ${
                  message.includes('확인')
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'bg-destructive/10 text-destructive border border-destructive/20'
                }`}
              >
                {message}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 약관 안내 문구 */}
        <p className="px-8 text-center text-xs leading-relaxed text-muted-foreground">
          로그인 또는 가입 시 Pilly의{' '}
          <Link href="/terms" className="underline underline-offset-4 hover:text-primary transition-colors">
            서비스 이용약관
          </Link>{' '}
          및{' '}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-primary transition-colors">
            개인정보 처리방침
          </Link>
          에 동의하게 됩니다.
        </p>
      </div>
    </div>
  );
}
