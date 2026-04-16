'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Pill, ArrowLeft, X, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';

export default function LoginPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [consents, setConsents] = useState({
    all: false,
    terms: false,
    privacy: false,
    sensitive: false,
  });

  const allConsented = consents.terms && consents.privacy && consents.sensitive;

  const handleLogin = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!allConsented) return;
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
      console.error(err);
      setMessage('네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAllConsentChange = (checked: boolean) => {
    setConsents({
      all: checked,
      terms: checked,
      privacy: checked,
      sensitive: checked,
    });
  };

  const handleSingleConsentChange = (key: keyof typeof consents, checked: boolean) => {
    const newConsents = { ...consents, [key]: checked };
    newConsents.all = newConsents.terms && newConsents.privacy && newConsents.sensitive;
    setConsents(newConsents as typeof consents);
  };

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-background px-4 overflow-hidden">
      <Card className="flex flex-col w-full max-w-lg h-[90dvh] max-h-[800px] shadow-2xl border-t-4 border-t-primary overflow-hidden">
        {/* 공통 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 rounded-full active:scale-95 shrink-0"
                onClick={() => setStep(1)}
              >
                <ArrowLeft size={18} />
              </Button>
            )}
            <Pill size={24} className="text-primary rotate-45 shrink-0" />
            <span className="font-bold text-lg tracking-tight hidden sm:inline-block">Pilly</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground mr-1">
              Step {step} of 2
            </span>
            {step === 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:flex text-xs disabled:opacity-50"
                disabled
              >
                Next <ChevronRight size={14} className="ml-1" />
              </Button>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full active:scale-95">
              <X size={18} />
            </Button>
          </div>
        </div>

        {/* Step 1: General Terms */}
        {step === 1 && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <CardHeader className="shrink-0 pb-4">
              <CardTitle className="text-2xl font-bold">서비스 이용약관</CardTitle>
              <CardDescription>
                Pilly 서비스 이용을 위한 기본 약관입니다. 내용을 확인해주세요.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto px-6 py-2">
              <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed space-y-6 pb-6">
                <div>
                  <h3 className="text-foreground font-semibold text-base mb-2">제 1 조 (목적)</h3>
                  <p className="mb-4">
                    본 약관은 'Pilly'(이하 "회사"라 함)가 제공하는 AI 복약 가이드 서비스 및 관련
                    제반 서비스의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항, 기타
                    필요한 사항을 규정함을 목적으로 합니다.
                  </p>
                </div>
                <div>
                  <h3 className="text-foreground font-semibold text-base mb-2">
                    제 2 조 (의료 정보 제공의 한계 및 면책)
                  </h3>
                  <p className="mb-2 text-foreground font-medium">
                    본 서비스가 제공하는 모든 정보(AI 답변 포함)는 참고용이며, 어떠한 경우에도
                    의사의 진단이나 약사의 처방을 대신할 수 없습니다.
                  </p>
                  <p className="mb-2">
                    사용자는 본 서비스의 정보를 신뢰하기 전 반드시 전문 의료인과 상담해야 합니다.
                    회사는 본 서비스의 정보를 이용함에 따라 발생하는 직접적, 간접적 손해에 대해
                    책임을 지지 않습니다.
                  </p>
                  <p className="mb-4">
                    AI 모델(Gemini 등)의 특성상 답변에 오류가 있을 수 있으며, 회사는 정보의 정확성,
                    완전성, 시의성을 보장하지 않습니다.
                  </p>
                </div>
                <div>
                  <h3 className="text-foreground font-semibold text-base mb-2">
                    제 3 조 (이용자의 의무)
                  </h3>
                  <p className="mb-4">
                    이용자는 처방전 사진 등을 업로드할 때 본인의 성명, 주민등록번호 등 민감한
                    개인식별정보를 반드시 가린 후 업로드해야 하며, 이를 이행하지 않아 발생하는 정보
                    유출 사고의 책임은 이용자 본인에게 있습니다.
                  </p>
                </div>
                <div>
                  <h3 className="text-foreground font-semibold text-base mb-2">
                    제 4 조 (관할 법원)
                  </h3>
                  <p>
                    서비스 이용과 관련하여 발생한 분쟁에 대해서는 회사의 본사 소재지를 관할하는
                    법원을 전용 관할 법원으로 합니다.
                  </p>
                </div>

                <p className="text-xs pt-6 pb-2">시행일자: 2026년 4월 9일</p>
              </div>
            </CardContent>

            <div className="shrink-0 p-6 pt-4 border-t mt-auto shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-10 bg-background">
              <Button
                className="w-full h-14 text-base font-semibold active:scale-[0.98] transition-transform"
                onClick={() => setStep(2)}
              >
                동의하고 계속하기
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Privacy/Terms Checkbox Form */}
        {step === 2 && (
          <form className="flex flex-col flex-1 overflow-hidden" onSubmit={handleLogin}>
            <CardHeader className="shrink-0 pb-4">
              <CardTitle className="text-2xl font-bold">Pilly 시작하기</CardTitle>
              <CardDescription>AI와 함께하는 스마트한 약 복용 관리</CardDescription>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto px-6 py-2 pb-6 space-y-8">
              {/* 이메일 입력 */}
              <div className="space-y-3">
                <Label htmlFor="email" className="font-semibold">
                  이메일 주소
                </Label>
                <Input
                  id="email"
                  type="email"
                  className="h-12 text-base"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {/* 약관 동의 폼 영역 */}
              <div className="space-y-4">
                <div className="pb-3 border-b-2 border-primary/20">
                  <h3 className="text-lg font-bold">서비스 이용에 동의해주세요.</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    원활한 서비스 이용을 위해 필수 항목 동의가 필요합니다.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/50 border hover:bg-muted transition-colors active:scale-[0.99] cursor-pointer">
                    <Checkbox
                      id="all"
                      checked={consents.all}
                      onCheckedChange={(c) => handleAllConsentChange(!!c)}
                      className="w-5 h-5 rounded-md"
                    />
                    <Label
                      htmlFor="all"
                      className="flex-1 text-base font-bold cursor-pointer select-none"
                    >
                      전체 동의하기
                    </Label>
                  </div>

                  <div className="pl-2 space-y-4 relative before:absolute before:left-[1.125rem] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
                    <div className="flex items-start space-x-3 group relative z-10 pl-8">
                      <Checkbox
                        id="terms"
                        checked={consents.terms}
                        onCheckedChange={(c) => handleSingleConsentChange('terms', !!c)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 flex items-center justify-between">
                        <Label
                          htmlFor="terms"
                          className="text-sm flex flex-1 items-center gap-1.5 cursor-pointer select-none font-medium active:opacity-70 group-hover:text-primary transition-colors"
                        >
                          <span className="text-primary font-bold">[필수]</span> 서비스 이용약관
                          동의
                        </Label>
                        <Link
                          href="/terms"
                          target="_blank"
                          className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2 active:scale-95 transition-all p-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          보기
                        </Link>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 group relative z-10 pl-8">
                      <Checkbox
                        id="privacy"
                        checked={consents.privacy}
                        onCheckedChange={(c) => handleSingleConsentChange('privacy', !!c)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 flex items-center justify-between">
                        <Label
                          htmlFor="privacy"
                          className="text-sm flex flex-1 items-center gap-1.5 cursor-pointer select-none font-medium active:opacity-70 group-hover:text-primary transition-colors"
                        >
                          <span className="text-primary font-bold">[필수]</span> 개인정보 수집 및
                          이용 동의
                        </Label>
                        <Link
                          href="/privacy"
                          target="_blank"
                          className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2 active:scale-95 transition-all p-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          보기
                        </Link>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 group relative z-10 pl-8">
                      <Checkbox
                        id="sensitive"
                        checked={consents.sensitive}
                        onCheckedChange={(c) => handleSingleConsentChange('sensitive', !!c)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 flex items-start flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <Label
                          htmlFor="sensitive"
                          className="text-sm flex flex-1 items-start gap-1.5 cursor-pointer leading-snug select-none font-medium active:opacity-70 group-hover:text-primary transition-colors"
                        >
                          <span className="text-primary font-bold shrink-0">[필수]</span>
                          <span>민감정보(건강 및 복약 기록 등) 수집/이용 동의</span>
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {message && (
                <div
                  className={`p-4 rounded-md text-sm font-medium ${message.includes('확인') ? 'bg-green-50 text-green-700 dark:bg-green-900/30' : 'bg-destructive/10 text-destructive'}`}
                >
                  {message}
                </div>
              )}
            </CardContent>

            <div className="shrink-0 p-6 pt-4 border-t-2 border-border shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.05)] z-10 bg-background mt-auto">
              <Button
                className="w-full h-14 text-base font-semibold active:scale-[0.98] transition-transform"
                type="submit"
                disabled={isLoading || !allConsented || !email}
              >
                {isLoading ? '요청 중...' : '동의하고 계속하기'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
