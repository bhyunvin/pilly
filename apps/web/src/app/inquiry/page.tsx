'use client';

import { CheckCircle2, FileText, Loader2, MessageSquare, Paperclip } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ChatSession, UserInquiry } from 'types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useApi } from '@/hooks/useApi';
import { logger } from '@/utils/logger';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * 1:1 문의 페이지 컴포넌트입니다.
 * 문의 작성(첨부파일 5개·5MB 제한, 상담 세션 선택 및 열람 동의)과 내 문의 내역 조회를 제공합니다.
 * 이용 제한(`RESTRICTED`) 사용자는 이의 제기를 위한 일반 문의만 작성할 수 있습니다.
 *
 * @returns 1:1 문의 페이지 렌더링 결과
 */
export default function InquiryPage(): React.ReactNode {
  const { apiFetch } = useApi();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [allowChatAccess, setAllowChatAccess] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [inquiries, setInquiries] = useState<UserInquiry[]>([]);
  const [isRestrictedUser, setIsRestrictedUser] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const fetchInitialData = useCallback(async () => {
    try {
      const [profileRes, listRes] = await Promise.all([
        apiFetch('/profile'),
        apiFetch('/inquiry/list'),
      ]);

      let restricted = false;
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        restricted = profileData?.data?.status === 'RESTRICTED';
        setIsRestrictedUser(restricted);
      }

      if (listRes.ok) {
        const listData = (await listRes.json()) as UserInquiry[];
        setInquiries(Array.isArray(listData) ? listData : []);
      }

      if (!restricted) {
        const sessionsRes = await apiFetch('/chat/sessions');
        if (sessionsRes.ok) {
          const sessionList = (await sessionsRes.json()) as ChatSession[];
          setSessions(Array.isArray(sessionList) ? sessionList : []);
        }
      }
    } catch (err) {
      logger.error({ err }, '문의 페이지 초기 데이터 로드 실패');
    } finally {
      setIsLoadingList(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchInitialData();
    });
  }, [fetchInitialData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > MAX_ATTACHMENTS) {
      setError(`첨부파일은 최대 ${MAX_ATTACHMENTS}개까지 선택할 수 있습니다.`);
    } else if (selected.some((file) => file.size > MAX_FILE_SIZE_BYTES)) {
      setError('개당 5MB를 초과하는 파일은 제외되었습니다.');
    } else {
      setError('');
    }

    const validFiles = selected
      .filter((file) => file.size <= MAX_FILE_SIZE_BYTES)
      .slice(0, MAX_ATTACHMENTS);
    setAttachments(validFiles);
  };

  const handleToggleAllowAccess = (checked: boolean) => {
    setAllowChatAccess(checked);
    if (checked && !selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(String(sessions[0].id));
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (allowChatAccess && !selectedSessionId) {
      setError('채팅 내역 열람 동의 시 연결할 상담 세션을 선택해 주세요.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', content);
      formData.append('allow_chat_access', allowChatAccess ? 'true' : 'false');
      if (allowChatAccess && selectedSessionId) {
        formData.append('chat_session_id', selectedSessionId);
      }
      for (const file of attachments) {
        formData.append('attachments', file);
      }

      const response = await apiFetch('/inquiry', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(errBody?.message || '문의 제출 중 오류가 발생했습니다.');
      }

      setIsSuccess(true);
      setTitle('');
      setContent('');
      setAttachments([]);
      setAllowChatAccess(false);
      setSelectedSessionId('');
      await fetchInitialData();
    } catch (err) {
      logger.error({ err }, '문의 제출 중 오류 발생');
      setError(err instanceof Error ? err.message : '서버와의 통신 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderInquiryList = (): React.ReactNode => {
    if (isLoadingList) {
      return (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          문의 내역을 불러오는 중...
        </div>
      );
    }

    if (inquiries.length === 0) {
      return (
        <p className="text-sm text-muted-foreground text-center py-6">
          접수한 문의 내역이 없습니다.
        </p>
      );
    }

    return (
      <ul className="space-y-3">
        {inquiries.map((inq) => (
          <li key={inq.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-base">{inq.title}</h3>
              <Badge variant={inq.status === 'RESOLVED' ? 'secondary' : 'outline'}>
                {inq.status === 'RESOLVED' ? '답변 완료' : '접수 대기'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{inq.content}</p>
            {inq.attachments && inq.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {inq.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary underline"
                  >
                    <Paperclip size={12} aria-hidden="true" />
                    {att.originalName}
                  </a>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              접수일: {inq.createdAt ? new Date(inq.createdAt).toLocaleString('ko-KR') : '-'}
            </p>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">1:1 문의</h1>
        <p className="text-muted-foreground">
          {isRestrictedUser
            ? '계정 이용 제한에 대한 이의 제기 및 문의를 남기실 수 있습니다.'
            : 'Pilly 서비스 이용 중 불편한 점이나 궁금한 점을 남겨주세요.'}
        </p>
      </div>

      {isSuccess ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <CheckCircle2 size={56} className="text-green-600" aria-hidden="true" />
            <h2 className="text-2xl font-bold">문의가 접수되었습니다.</h2>
            <p className="text-muted-foreground text-center">
              관리자가 확인 후 순차적으로 답변 드리겠습니다.
            </p>
            <Button type="button" onClick={() => setIsSuccess(false)} variant="outline">
              추가 문의하기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare size={18} className="text-primary" aria-hidden="true" /> 문의하기
            </CardTitle>
            <CardDescription>신속하고 정확하게 확인하겠습니다.</CardDescription>
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

              <div className="space-y-2">
                <Label htmlFor="inquiry-attachment">첨부파일 (최대 5개, 개당 5MB 이하)</Label>
                <Input
                  id="inquiry-attachment"
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="text-base md:text-sm"
                />
                {attachments.length > 0 && (
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {attachments.length}개의 파일이 선택됨 (
                    {attachments.map((file) => file.name).join(', ')})
                  </p>
                )}
              </div>

              {!isRestrictedUser && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="allowAccess"
                      checked={allowChatAccess}
                      onCheckedChange={(checked) => handleToggleAllowAccess(checked === true)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="allowAccess" className="text-sm font-medium cursor-pointer">
                        채팅 내역 열람 동의 (선택)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        관리자의 원활한 상담을 위해 24시간 동안 선택한 AI 상담 내역 열람에
                        동의합니다.
                      </p>
                    </div>
                  </div>

                  {allowChatAccess && (
                    <div className="space-y-1.5 pl-7">
                      <Label htmlFor="chatSessionSelect" className="text-xs">
                        연결할 AI 상담 세션
                      </Label>
                      {sessions.length === 0 ? (
                        <p className="text-xs text-destructive">
                          연결 가능한 상담 세션이 없습니다. 체크를 해제하고 일반 문의를 이용해
                          주세요.
                        </p>
                      ) : (
                        <select
                          id="chatSessionSelect"
                          value={selectedSessionId}
                          onChange={(e) => setSelectedSessionId(e.target.value)}
                          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">상담 세션을 선택해 주세요</option>
                          {sessions.map((session) => (
                            <option key={session.id} value={String(session.id)}>
                              #{session.id} - {session.title || '새로운 상담'}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}

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
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText size={18} className="text-primary" aria-hidden="true" />내 문의 내역
          </CardTitle>
          <CardDescription>내가 접수한 1:1 문의와 처리 상태를 확인합니다.</CardDescription>
        </CardHeader>
        <CardContent>{renderInquiryList()}</CardContent>
      </Card>
    </div>
  );
}
