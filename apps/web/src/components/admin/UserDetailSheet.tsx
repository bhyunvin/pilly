'use client';

import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { User, AlertCircle, History } from 'lucide-react';
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

interface UserDetailSheetProps {
  selectedUser: UserProfile | null;
  restrictionReason: string;
  setRestrictionReason: (val: string) => void;
  toggleRole: (userId: string) => void;
  restrictUser: (userId: string) => void;
  activateUser: (userId: string) => void;
}

/**
 * @description 관리자 페이지에서 특정 사용자의 상세 정보 조회 및 관리 기능을 제공하는 시트 컴포넌트입니다.
 * 사용자의 역할(ADMIN/USER) 변경, 이용 제한 상태 설정 및 해제, 제재 히스토리 타임라인 조회 기능을 포함합니다.
 *
 * @param props - 선택된 사용자 정보, 제재 사유 상태 및 관리 액션 함수들
 * @returns 사용자가 선택된 경우 상세 관리 시트를 반환하며, 그렇지 않으면 null을 반환합니다.
 */
export function UserDetailSheet({
  selectedUser,
  restrictionReason,
  setRestrictionReason,
  toggleRole,
  restrictUser,
  activateUser,
}: Readonly<UserDetailSheetProps>) {
  if (!selectedUser) return null;

  return (
    <SheetContent className="w-full sm:max-w-md overflow-y-auto">
      <div className="space-y-8 py-6">
        <SheetHeader>
          <SheetTitle className="text-2xl flex items-center gap-2">
            <User size={24} aria-hidden="true" />
            {selectedUser.nickname}
          </SheetTitle>
          <SheetDescription>사용자 ID: {selectedUser.userId}</SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase">현재 권한</p>
            <div className="flex items-center gap-2">
              <Badge variant={selectedUser.role === 'ADMIN' ? 'destructive' : 'secondary'}>
                {selectedUser.role}
              </Badge>
              <Switch
                checked={selectedUser.role === 'ADMIN'}
                onCheckedChange={() => toggleRole(selectedUser.userId)}
                aria-label="관리자 권한 토글"
              />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase">현재 상태</p>
            <Badge variant={selectedUser.status === 'RESTRICTED' ? 'destructive' : 'outline'}>
              {selectedUser.status === 'RESTRICTED' ? '이용제한' : '활성'}
            </Badge>
          </div>
        </div>

        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <AlertCircle size={16} aria-hidden="true" />
              계정 상태 변경
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedUser.status === 'ACTIVE' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reason">제한 사유</Label>
                  <Textarea
                    id="reason"
                    className="text-base md:text-sm"
                    placeholder="어뷰징 또는 비정상 접근 등 사유 입력"
                    value={restrictionReason}
                    onChange={(e) => setRestrictionReason(e.target.value)}
                  />
                </div>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => restrictUser(selectedUser.userId)}
                >
                  계정 이용 제한하기
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-white/50 rounded text-sm space-y-1">
                  <p className="font-semibold">제한 사유:</p>
                  <p>{selectedUser.restrictedReason || '사유 없음'}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    제한 일시:{' '}
                    {selectedUser.restrictedAt &&
                      format(new Date(selectedUser.restrictedAt), 'yyyy-MM-dd HH:mm:ss')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => activateUser(selectedUser.userId)}
                >
                  이용 제한 해제하기
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <History size={16} aria-hidden="true" />
            제재 히스토리 타임라인
          </h3>
          <div className="space-y-4 border-l-2 border-muted ml-2 pl-4">
            {selectedUser.restrictionHistory && selectedUser.restrictionHistory.length > 0 ? (
              selectedUser.restrictionHistory.map((h) => (
                <div key={h.id} className="relative space-y-1">
                  <div className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-muted border-2 border-background" />
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(h.createdAt), 'yyyy. MM. dd. HH:mm', { locale: ko })}
                  </p>
                  <p className="text-sm font-medium">{h.reason}</p>
                  <p className="text-xs text-muted-foreground">관리자 ID: {h.adminId}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground italic">히스토리가 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </SheetContent>
  );
}
