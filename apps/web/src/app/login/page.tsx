'use client';

import { useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Pill, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [consents, setConsents] = useState({
    terms: false,
    privacy: false,
    sensitive: false,
  });

  const allConsented = consents.terms && consents.privacy && consents.sensitive;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allConsented) return;
    setIsLoading(true);
    setMessage('');

    try {
      // Magic Link 발송
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
      console.error(err);
      setMessage('네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
        <CardHeader className="text-center space-y-1">
          <div className="flex justify-center mb-2">
            <Pill size={40} className="text-primary rotate-45" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Pilly 시작하기</CardTitle>
          <CardDescription>AI와 함께하는 스마트한 약 복용 관리</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">이메일 주소</Label>
              <Input
                id="email"
                type="email"
                className="text-base md:text-sm"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="terms"
                  checked={consents.terms}
                  onCheckedChange={(checked) =>
                    setConsents((prev) => ({ ...prev, terms: checked as boolean }))
                  }
                />
                <Label
                  htmlFor="terms"
                  className="text-sm font-normal flex items-center gap-1 cursor-pointer"
                >
                  [필수] 서비스 이용약관 동의
                  <Link
                    href="/terms"
                    target="_blank"
                    className="text-muted-foreground"
                    aria-label="서비스 이용약관 상세보기"
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                  </Link>
                </Label>
              </div>
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="privacy"
                  checked={consents.privacy}
                  onCheckedChange={(checked) =>
                    setConsents((prev) => ({ ...prev, privacy: checked as boolean }))
                  }
                />
                <Label
                  htmlFor="privacy"
                  className="text-sm font-normal flex items-center gap-1 cursor-pointer"
                >
                  [필수] 개인정보 수집 및 이용 동의
                  <Link
                    href="/privacy"
                    target="_blank"
                    className="text-muted-foreground"
                    aria-label="개인정보 수집 및 이용 동의 상세보기"
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                  </Link>
                </Label>
              </div>
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="sensitive"
                  checked={consents.sensitive}
                  onCheckedChange={(checked) =>
                    setConsents((prev) => ({ ...prev, sensitive: checked as boolean }))
                  }
                />
                <Label
                  htmlFor="sensitive"
                  className="text-sm font-normal cursor-pointer leading-snug"
                >
                  [필수] 민감정보(건강 및 복약 기록 등) 수집 및 이용 동의
                </Label>
              </div>
            </div>

            {message && (
              <p
                className={`text-sm font-medium ${message.includes('확인') ? 'text-green-600' : 'text-destructive'}`}
              >
                {message}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button className="w-full h-11" type="submit" disabled={isLoading || !allConsented}>
              {isLoading ? '요청 중...' : '동의하고 계속하기'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
