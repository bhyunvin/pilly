'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Sheet } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import dynamic from 'next/dynamic';

const UserDetailSheet = dynamic(
  () => import('@/components/admin/UserDetailSheet').then((mod) => mod.UserDetailSheet),
  {
    ssr: false,
    loading: () => <div className="p-8 text-center">불러오는 중...</div>,
  },
);

interface RestrictionHistory {
  id: number;
  adminId: string;
  reason: string;
  createdAt: string;
}

interface UserProfile {
  userId: string;
  nickname: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'RESTRICTED';
  restrictedReason?: string;
  restrictedAt?: string;
  createdAt: string;
  restrictionHistory?: RestrictionHistory[];
}

export default function AdminUsersPage() {
  const { apiFetch } = useApi();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [restrictionReason, setRestrictionReason] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const httpResponse = await apiFetch('/admin/users');
      const userListResponse = await httpResponse.json();
      if (userListResponse.success) {
        setUsers(userListResponse.users);
      }
    } catch (err) {
      console.error('Admin fetch users error:', err);
      alert('사용자 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  const fetchUserDetails = async (userId: string) => {
    try {
      const httpResponse = await apiFetch(`/admin/users/${userId}`);
      const userDetailResponse = await httpResponse.json();
      if (userDetailResponse.success) {
        setSelectedUser(userDetailResponse.user);
        setIsDetailOpen(true);
      }
    } catch (err) {
      console.error('Admin fetch user details error:', err);
    }
  };

  const toggleRole = async (userId: string) => {
    try {
      const httpResponse = await apiFetch(`/admin/users/${userId}/role`, {
        method: 'PATCH',
      });
      const roleToggleResponse = await httpResponse.json();
      if (roleToggleResponse.success) {
        setUsers((prev) =>
          prev.map((u) => (u.userId === userId ? { ...u, role: roleToggleResponse.role } : u)),
        );
        if (selectedUser?.userId === userId) {
          setSelectedUser((prev) => (prev ? { ...prev, role: roleToggleResponse.role } : null));
        }
      }
    } catch (err) {
      console.error('Admin toggle role error:', err);
      alert('권한 변경 중 오류가 발생했습니다.');
    }
  };

  const restrictUser = async (userId: string) => {
    try {
      const httpResponse = await apiFetch(`/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'RESTRICTED',
          reason: restrictionReason,
        }),
      });
      const statusUpdateResponse = await httpResponse.json();
      if (statusUpdateResponse.success) {
        fetchUsers();
        fetchUserDetails(userId);
        setRestrictionReason('');
      }
    } catch (err) {
      console.error('Admin restrict user error:', err);
    }
  };

  const activateUser = async (userId: string) => {
    try {
      const httpResponse = await apiFetch(`/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'ACTIVE',
        }),
      });
      const statusUpdateResponse = await httpResponse.json();
      if (statusUpdateResponse.success) {
        fetchUsers();
        fetchUserDetails(userId);
        setRestrictionReason('');
      }
    } catch (err) {
      console.error('Admin activate user error:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">사용자 목록을 불러오는 중...</div>
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
                  {format(new Date(user.createdAt), 'yyyy-MM-dd')}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm">
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
