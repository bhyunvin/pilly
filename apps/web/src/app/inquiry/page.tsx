'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { MessageSquare, CheckCircle2, Loader2 } from 'lucide-react';

/**
 * 1:1 문의 페이지 컴포넌트입니다.
 * 사용자가 서비스 이용 관련 문의사항을 작성하고 관리자에게 제출할 수 있는 기능을 제공합니다.
 *
 * @returns {JSX.Element} 1:1 문의 페이지 렌더링 결과
 */
export default function InquiryPage() {
  const { apiFetch } = useApi();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [allowChatAccess, setAllowChatAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  /**
   * 작성된 문의사항을 서버로 비동기 제출합니다.
   *
   * @async
   * @param {React.FormEvent} e - 폼 제출 이벤트 객체
   */
  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiFetch('/inquiry', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content,
          allow_chat_access: allowChatAccess,
        }),
      });

      if (!response.ok) {
        throw new Error('문의 제출 중 오류가 발생했습니다.');
      }

      setIsSuccess(true);
      setTitle('');
      setContent('');
      setAllowChatAccess(false);
    } catch (err) {
      console.error('문의 제출 중 오류 발생:', err);
      setError('서버와의 통신 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 문의 제출 성공 화면
  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <CheckCircle2 size={60} className="text-green-500" aria-hidden="true" />
        <h2 className="text-2xl font-bold">문의가 접수되었습니다.</h2>
        <p className="text-muted-foreground">관리자가 확인 후 답변 드릴 예정입니다.</p>
        <Button onClick={() => setIsSuccess(false)} variant="outline">
          추가 문의하기
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">1:1 문의</h1>
        <p className="text-muted-foreground">
          Pilly 서비스 이용 중 불편한 점이나 궁금한 점을 남겨주세요.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare size={18} className="text-primary" aria-hidden="true" /> 문의하기
          </CardTitle>
          <CardDescription>신속하고 정확하게 답변 드리겠습니다.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">제목</Label>
              <Input
                id="title"
                className="text-base md:text-sm"
                placeholder="제목을 입력해 주세요"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label="문의 제목"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">내용</Label>
              <Textarea
                id="content"
                className="text-base md:text-sm"
                placeholder="내용을 입력해 주세요"
                rows={6}
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                aria-label="문의 내용"
              />
            </div>
            <div className="flex items-start space-x-3 pt-2">
              <Checkbox
                id="allowAccess"
                checked={allowChatAccess}
                onCheckedChange={(checked) => setAllowChatAccess(checked === true)}
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="allowAccess"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  채팅 내역 열람 동의 (선택)
                </label>
                <p className="text-xs text-muted-foreground">
                  관리자의 원활한 상담을 위해 24시간 동안 AI 챗봇 대화 내역 제공에 동의합니다.
                </p>
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive font-medium" role="alert">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="animate-spin" size={18} aria-hidden="true" />
              ) : (
                '문의 제출하기'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
