'use client';

import { format } from 'date-fns';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageSquare,
  Paperclip,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { InquiryStatus, UserInquiry } from 'types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { logger } from '@/utils/logger';

/**
 * 관리자용 1:1 문의 관리 페이지 컴포넌트입니다.
 * 전체 사용자 문의, 첨부파일, 처리 상태 변경 및 JIT 승인 채팅 내역 열람 바로가기를 제공합니다.
 *
 * @returns 관리자 문의 관리 페이지 UI
 */
export default function AdminInquiriesPage(): React.ReactNode {
  const { apiFetch } = useApi();
  const [inquiries, setInquiries] = useState<UserInquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchInquiries = useCallback(async () => {
    try {
      setError('');
      const response = await apiFetch('/admin/inquiries');
      if (response.status === 403) {
        setError('관리자 권한이 필요합니다.');
        return;
      }
      if (!response.ok) {
        throw new Error('문의 목록 조회 실패');
      }
      const result = (await response.json()) as { success: boolean; data: UserInquiry[] };
      if (result.success) {
        setInquiries(result.data);
      }
    } catch (err) {
      logger.error({ err }, '관리자 문의 목록 로드 실패');
      setError('문의 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchInquiries();
    });
  }, [fetchInquiries]);

  const handleToggleStatus = async (inquiry: UserInquiry) => {
    if (updatingId !== null) return;
    const nextStatus: InquiryStatus = inquiry.status === 'RESOLVED' ? 'PENDING' : 'RESOLVED';
    setUpdatingId(inquiry.id);

    try {
      const response = await apiFetch(`/admin/inquiries/${inquiry.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        throw new Error('문의 상태 변경 실패');
      }
      setInquiries((prev) =>
        prev.map((item) => (item.id === inquiry.id ? { ...item, status: nextStatus } : item)),
      );
    } catch (err) {
      logger.error({ err }, '문의 상태 변경 오류');
      alert('문의 상태 변경 중 오류가 발생했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 size={24} className="animate-spin" aria-hidden="true" />
        <span>문의 목록을 불러오는 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto py-20">
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
            <AlertCircle size={40} className="text-destructive" aria-hidden="true" />
            <p className="font-semibold text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <MessageSquare className="text-primary" aria-hidden="true" />
          1:1 문의 관리
        </h1>
        <Badge variant="outline" className="px-3 py-1">
          총 {inquiries.length}건
        </Badge>
      </div>

      {inquiries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            접수된 1:1 문의가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {inquiries.map((inq) => (
            <Card key={inq.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{inq.title}</CardTitle>
                    <CardDescription>
                      작성자: {inq.nickname || '미설정'} ({inq.userId}) ·{' '}
                      {inq.createdAt ? format(new Date(inq.createdAt), 'yyyy-MM-dd HH:mm') : '-'}
                    </CardDescription>
                  </div>
                  <Badge variant={inq.status === 'RESOLVED' ? 'secondary' : 'destructive'}>
                    {inq.status === 'RESOLVED' ? '처리 완료' : '접수 대기'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{inq.content}</p>

                {inq.attachments && inq.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {inq.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={att.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs border rounded px-2.5 py-1 hover:bg-muted"
                      >
                        <Paperclip size={12} aria-hidden="true" />
                        {att.originalName}
                      </a>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
                  {inq.chatAccessId && (
                    <Link
                      href={`/admin/chat/${inq.chatAccessId}`}
                      aria-label={`${inq.title} 연결 채팅 내역 열람`}
                    >
                      <Button type="button" variant="outline" size="sm" className="gap-1.5">
                        <ExternalLink size={14} aria-hidden="true" />
                        승인된 채팅 내역 열람
                      </Button>
                    </Link>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={inq.status === 'RESOLVED' ? 'outline' : 'default'}
                    onClick={() => handleToggleStatus(inq)}
                    disabled={updatingId === inq.id}
                    className="gap-1.5"
                  >
                    <CheckCircle2 size={14} aria-hidden="true" />
                    {inq.status === 'RESOLVED' ? '접수 대기로 되돌리기' : '처리 완료로 변경'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
