'use client';

import { useEffect, useState } from 'react';
import { logger } from '@/utils/logger';
import { useParams } from 'next/navigation';
import { authClient } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Bot, User, AlertCircle, Loader2, Clock } from 'lucide-react';

interface ChatLog {
  id: number;
  userId: string;
  prompt: string;
  response: string;
  createdAt: string;
}

/**
 * 관리자용 채팅 내역 열람 페이지 컴포넌트입니다.
 * 1:1 문의 대응을 위해 사용자 동의를 얻은 한시적 접근 권한(UUID)을 통해 대화 로그를 조회합니다.
 *
 * @returns 관리자용 채팅 로그 열람 페이지 렌더링 결과
 */
export default function AdminChatViewPage(): React.ReactNode {
  const params = useParams();
  const uuid = params.uuid as string;
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    /**
     * UUID를 사용하여 특정 사용자의 채팅 로그를 서버로부터 비동기로 가져옵니다.
     *
     * @async
     */
    const fetchChatLogs = async () => {
      try {
        const { data: sessionData } = await authClient.getSession();
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/admin/users/chatting/${uuid}`,
          {
            headers: {
              Authorization: `Bearer ${sessionData?.session.id}`,
            },
          },
        );

        if (response.status === 403) {
          setError('접근 권한이 없거나 열람 유효시간(24시간)이 만료되었습니다.');
          return;
        }

        if (!response.ok) {
          throw new Error('채팅 내역을 불러오는데 실패했습니다.');
        }

        const result = await response.json();
        setLogs(result.data);
      } catch (err) {
        logger.error({ err }, 'Admin chat logs fetch error');
        setError('서버와의 통신 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    if (uuid) fetchChatLogs();
  }, [uuid]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 size={40} className="animate-spin text-primary" />
        <p className="text-muted-foreground">채팅 내역을 안전하게 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto py-20">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
            <AlertCircle size={48} className="text-destructive" />
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-destructive">열람 불가</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock size={12} /> JIT Access 정책에 따라 24시간 후 자동 만료됩니다.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">상담용 채팅 내역 열람</h1>
          <p className="text-sm text-muted-foreground">
            사용자 동의에 의한 한시적 접근 (UUID: {uuid.slice(0, 8)}...)
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {logs.map((log) => (
          <div key={log.id} className="space-y-4">
            <div className="flex items-start gap-3 flex-row-reverse max-w-[85%] ml-auto">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0">
                <User size={16} />
              </div>
              <div className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl rounded-tr-none text-sm shadow-sm">
                {log.prompt}
              </div>
            </div>
            <div className="flex items-start gap-3 max-w-[85%] mr-auto">
              <div className="w-8 h-8 rounded-full bg-muted-foreground/20 flex items-center justify-center text-muted-foreground shrink-0">
                <Bot size={16} />
              </div>
              <div className="bg-background border px-4 py-2 rounded-2xl rounded-tl-none text-sm shadow-sm">
                {log.response}
              </div>
            </div>
            <div className="text-[10px] text-center text-muted-foreground">
              {new Date(log.createdAt).toLocaleString()}
            </div>
            <hr className="border-dashed" />
          </div>
        ))}

        {logs.length === 0 && (
          <div className="text-center py-20 bg-muted/20 rounded-xl border-2 border-dashed">
            <p className="text-muted-foreground">대화 내역이 존재하지 않습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
