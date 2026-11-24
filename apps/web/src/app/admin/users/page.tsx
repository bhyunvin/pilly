'use client';

import { format } from 'date-fns';
import { AlertCircle, ShieldAlert } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import type { UserProfile } from 'types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { logger } from '@/utils/logger';

const UserDetailSheet = dynamic(
  () => import('@/components/admin/UserDetailSheet').then((mod) => mod.UserDetailSheet),
  {
    ssr: false,
    loading: () => <div className="p-8 text-center">불러오는 중...</div>,
  },
);

/**
 * 관리자용 사용자 관리 페이지 컴포넌트입니다.
 * 전체 사용자 목록 조회, 상세 정보 확인, 권한 변경 및 이용 제한 등의 관리 기능을 수행합니다.
 *
 * @returns 사용자 관리 페이지 렌더링 결과
 */
export default function AdminUsersPage(): React.ReactNode {
  const { apiFetch } = useApi();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [restrictionReason, setRestrictionReason] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      setError('');
      const httpResponse = await apiFetch('/admin/users');
      if (httpResponse.status === 403) {
        setError('관리자 권한이 필요합니다.');
        return;
      }
      if (!httpResponse.ok) {
        throw new Error('사용자 목록 조회 실패');
      }
      const userListResponse = await httpResponse.json();
      if (userListResponse.success) {
        setUsers(userListResponse.users);
      }
    } catch (err) {
      logger.error({ err }, 'Admin fetch users error');
      setError('사용자 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  const fetchUserDetails = async (userId: string) => {
    try {
      const httpResponse = await apiFetch(`/admin/users/${userId}`);
      const userDetailResponse = await httpResponse.json();
      if (httpResponse.ok && userDetailResponse.success) {
        setSelectedUser(userDetailResponse.user);
        setIsDetailOpen(true);
      }
    } catch (err) {
      logger.error({ err }, 'Admin fetch user details error');
    }
  };

  const toggleRole = async (userId: string) => {
    try {
      const httpResponse = await apiFetch(`/admin/users/${userId}/role`, {
        method: 'PATCH',
      });
      const roleToggleResponse = await httpResponse.json();
      if (!httpResponse.ok) {
        alert(roleToggleResponse.message || '권한 변경에 실패했습니다.');
        return;
      }
      if (roleToggleResponse.success) {
        setUsers((prev) =>
          prev.map((u) => (u.userId === userId ? { ...u, role: roleToggleResponse.role } : u)),
        );
        if (selectedUser?.userId === userId) {
          setSelectedUser((prev) => (prev ? { ...prev, role: roleToggleResponse.role } : null));
        }
      }
    } catch (err) {
      logger.error({ err }, 'Admin toggle role error');
      alert('권한 변경 중 오류가 발생했습니다.');
    }
  };

  const updateUserStatus = async (
    userId: string,
    payload: { status: 'RESTRICTED' | 'ACTIVE'; reason?: string },
    fallbackMessage: string,
  ) => {
    try {
      const httpResponse = await apiFetch(`/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const statusUpdateResponse = await httpResponse.json();
      if (!httpResponse.ok) {
        alert(statusUpdateResponse.message || fallbackMessage);
        return;
      }
      if (statusUpdateResponse.success) {
        await Promise.all([fetchUsers(), fetchUserDetails(userId)]);
        setRestrictionReason('');
      }
    } catch (err) {
      logger.error({ err, status: payload.status }, 'Admin update user status error');
    }
  };

  const restrictUser = (userId: string) =>
    updateUserStatus(
      userId,
      { status: 'RESTRICTED', reason: restrictionReason },
      '이용 제한 처리에 실패했습니다.',
    );

  const activateUser = (userId: string) =>
    updateUserStatus(userId, { status: 'ACTIVE' }, '이용 제한 해제에 실패했습니다.');

  useEffect(() => {
    queueMicrotask(() => {
      void fetchUsers();
    });
  }, [fetchUsers]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">사용자 목록을 불러오는 중...</div>
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
          <ShieldAlert className="text-primary" aria-hidden="true" />
          사용자 관리
        </h1>
        <Badge variant="outline" className="px-3 py-1">
          총 {users.length}명
        </Badge>
      </div>

      <Card className="overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="whitespace-nowrap">
              <TableHead>닉네임</TableHead>
              <TableHead>권한</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>가입일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow
                key={user.userId}
                className="cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                onClick={() => fetchUserDetails(user.userId)}
              >
                <TableCell className="font-medium">{user.nickname}</TableCell>
                <TableCell>
                  <Badge variant={user.role === 'ADMIN' ? 'destructive' : 'secondary'}>
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.status === 'RESTRICTED' ? 'destructive' : 'outline'}>
                    {user.status === 'RESTRICTED' ? '이용제한' : '활성'}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {user.createdAt ? format(new Date(user.createdAt), 'yyyy-MM-dd') : '-'}
                </TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" size="sm">
                    상세보기
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <UserDetailSheet
          selectedUser={selectedUser}
          restrictionReason={restrictionReason}
          setRestrictionReason={setRestrictionReason}
          toggleRole={toggleRole}
          restrictUser={restrictUser}
          activateUser={activateUser}
        />
      </Sheet>
    </div>
  );
}
