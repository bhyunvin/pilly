'use client';

import { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { authClient } from '@/lib/auth';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { UserMinus, Info } from 'lucide-react';
import { format, addDays } from 'date-fns';

interface WithdrawalUser {
  userId: string;
  nickname: string;
  deletedAt: string;
  deletionReason: string;
}

/**
 * 관리자용 탈퇴 예정자 관리 페이지 컴포넌트입니다.
 * 탈퇴를 요청한 사용자 목록과 데이터 영구 삭제 예정일을 조회할 수 있습니다.
 *
 * @returns {JSX.Element} 탈퇴 예정자 관리 페이지 렌더링 결과
 */
export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    /**
     * 서버로부터 탈퇴 대기 중인 사용자 목록을 비동기로 가져옵니다.
     *
     * @async
     * @function fetchWithdrawals
     */
    const fetchWithdrawals = async () => {
      try {
        const { data: sessionData } = await authClient.getSession();
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/admin/withdrawals`,
          {
            headers: { Authorization: `Bearer ${sessionData?.session.id}` },
          },
        );
        const result = await response.json();
        if (result.success) {
          setWithdrawals(result.data);
        }
      } catch (err) {
        logger.error({ err }, 'Admin withdrawals fetch error');
      } finally {
        setIsLoading(false);
      }
    };
    fetchWithdrawals();
  }, []);

  if (isLoading) return <div className="p-8 text-center">탈퇴 예정자 목록을 불러오는 중...</div>;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <UserMinus className="text-destructive" />
          탈퇴 예정자 관리
        </h1>
        <Badge variant="outline" className="px-3 py-1">
          총 {withdrawals.length}명
        </Badge>
      </div>

      <div className="bg-muted/50 p-4 rounded-lg flex items-start gap-3 text-sm text-muted-foreground">
        <Info className="shrink-0 h-4 w-4 mt-0.5" />
        <p>
          탈퇴 요청일로부터 30일이 경과하면 시스템에서 해당 사용자의 데이터가 영구적으로 삭제됩니다.
          이 페이지는 조회 전용(Read-only)이며, 관리자가 임의로 복구할 수 없습니다.
        </p>
      </div>

      <Card className="overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="whitespace-nowrap">
              <TableHead>닉네임 (ID)</TableHead>
              <TableHead>탈퇴 요청일</TableHead>
              <TableHead>영구 삭제 예정일</TableHead>
              <TableHead>탈퇴 사유</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withdrawals.length > 0 ? (
              withdrawals.map((user) => {
                const GRACE_PERIOD_DAYS = 30;
                const deletionDate = addDays(new Date(user.deletedAt), GRACE_PERIOD_DAYS);
                return (
                  <TableRow key={user.userId} className="whitespace-nowrap">
                    <TableCell>
                      <div className="font-medium">{user.nickname}</div>
                      <div className="text-xs text-muted-foreground">{user.userId}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(user.deletedAt), 'yyyy-MM-dd HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">
                        {format(deletionDate, 'yyyy-MM-dd')}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm" title={user.deletionReason}>
                      {user.deletionReason}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  탈퇴 예정인 사용자가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
