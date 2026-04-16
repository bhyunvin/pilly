'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ChatInquiryModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
}

/**
 * @description 채팅 세션과 관련된 1:1 문의를 작성하고 제출하는 모달 컴포넌트입니다.
 * 사용자는 제목, 내용, 첨부파일을 입력할 수 있으며, 관리자에게 해당 채팅 내역에 대한 접근 권한을 부여할지 선택할 수 있습니다.
 *
 * @param {ChatInquiryModalProps} props - 모달 제어 상태 및 세션 ID
 * @returns {JSX.Element} 문의 폼이 포함된 다이얼로그 모달을 반환합니다.
 */
export function ChatInquiryModal({
  isOpen,
  onOpenChange,
  sessionId,
}: Readonly<ChatInquiryModalProps>) {
  const { apiFetch } = useApi();
  const [inquiryTitle, setInquiryTitle] = useState('');
  const [inquiryContent, setInquiryContent] = useState('');
  const [inquiryAttachment, setInquiryAttachment] = useState<File[]>([]);
  const [allowChatAccess, setAllowChatAccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * @description 문의 폼 제출을 처리하는 비동기 함수입니다.
   * 입력된 데이터를 FormData로 구성하여 API로 전송하고, 성공 시 입력 필드를 초기화합니다.
   *
   * @async
   * @param {React.FormEvent} e - 폼 제출 이벤트
   */
  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('title', inquiryTitle);
      formData.append('content', inquiryContent);
      formData.append('chat_session_id', sessionId);
      formData.append('allow_chat_access', allowChatAccess ? 'true' : 'false');
      inquiryAttachment.forEach((file) => formData.append('attachments', file));

      const res = await apiFetch('/inquiry', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('문의 등록 실패');

      alert('문의가 정상적으로 접수되었습니다.');
      onOpenChange(false);
      setInquiryTitle('');
      setInquiryContent('');
      setInquiryAttachment([]);
    } catch (err) {
      console.error('Inquiry submit error:', err);
      alert('문의 등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[425px] bg-background">
        <DialogHeader>
          <DialogTitle>1:1 문의하기</DialogTitle>
          <DialogDescription>
            AI 상담 내용에 대한 질문이나 오류를 관리자에게 문의하세요.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="title">제목</Label>
            <Input
              id="title"
              className="text-base md:text-sm"
              value={inquiryTitle}
              onChange={(e) => setInquiryTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content">내용</Label>
            <Textarea
              id="content"
              className="min-h-[100px] text-base md:text-sm"
              value={inquiryContent}
              onChange={(e) => setInquiryContent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="attachment">첨부파일</Label>
            <Input
              id="attachment"
              className="text-base md:text-sm"
              type="file"
              multiple
              onChange={(e) => setInquiryAttachment(Array.from(e.target.files || []).slice(0, 5))}
            />
            {inquiryAttachment.length > 0 && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {inquiryAttachment.length}개의 파일이 선택됨
              </p>
            )}
          </div>
          <div className="flex items-start space-x-2 pt-2">
            <Checkbox
              id="allow_chat"
              checked={allowChatAccess}
              onCheckedChange={(checked) => setAllowChatAccess(checked === true)}
            />
            <Label htmlFor="allow_chat" className="text-sm cursor-pointer">
              대화 내역 열람 동의
            </Label>
          </div>
          <DialogFooter className="pt-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '등록 중...' : '문의 등록하기'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
