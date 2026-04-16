'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth';
import { useApi } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AlertCircle, User, LogOut } from 'lucide-react';

/**
 * 마이페이지 컴포넌트입니다.
 * 사용자 프로필 정보 조회, 닉네임 수정, 회원 탈퇴 기능을 제공합니다.
 *
 * @returns {JSX.Element} 마이페이지 렌더링 결과
 */
export default function ProfilePage() {
  const router = useRouter();
  const { apiFetch } = useApi();

  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);

  /**
   * 현재 로그인한 사용자의 프로필 정보를 서버로부터 비동기로 가져옵니다.
   *
   * @async
   * @function fetchProfile
   */
  const fetchProfile = useCallback(async () => {
    try {
      const { data: sessionData } = await authClient.getSession();
      if (!sessionData) {
        router.push('/login');
        return;
      }

      setEmail(sessionData.user.email);

      const response = await apiFetch('/profile');
      const result = await response.json();

      if (result.success && result.data) {
        setNickname(result.data.nickname);
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [router, apiFetch]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  /**
   * 변경된 닉네임을 서버에 비동기로 업데이트합니다.
   *
   * @async
   * @param {React.FormEvent} e - 폼 제출 이벤트 객체
   */
  const handleUpdateNickname = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage({ text: '', type: '' });

    try {
      const response = await apiFetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ nickname }),
      });

      const result = await response.json();
      if (response.ok) {
        setMessage({ text: '닉네임이 성공적으로 수정되었습니다.', type: 'success' });
      } else {
        setMessage({ text: result.message || '수정 실패', type: 'error' });
      }
    } catch (err) {
      console.error('Nickname update error:', err);
      setMessage({ text: '오류가 발생했습니다.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 회원 탈퇴 사유를 제출하고 탈퇴 절차를 비동기로 시작합니다.
   *
   * @async
   */
  const handleWithdraw = async () => {
    if (!withdrawalReason.trim()) {
      alert('탈퇴 사유를 입력해주세요.');
      return;
    }

    setIsWithdrawing(true);
    try {
      const response = await apiFetch('/profile/withdraw', {
        method: 'POST',
        body: JSON.stringify({ reason: withdrawalReason }),
      });

      if (response.ok) {
        router.replace('/restore');
      } else {
        alert('탈퇴 처리 중 오류가 발생했습니다.');
      }
    } catch (err) {
      console.error('Withdraw error:', err);
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">로딩 중...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User size={20} />
            계정 설정
          </CardTitle>
          <CardDescription>개인 정보를 관리하세요.</CardDescription>
        </CardHeader>
        <form onSubmit={handleUpdateNickname}>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">이메일 (읽기 전용)</Label>
              <Input id="email" value={email} readOnly className="bg-muted text-base md:text-sm" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nickname">닉네임</Label>
              <Input
                id="nickname"
                className="text-base md:text-sm"
                required
                minLength={2}
                maxLength={40}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>

            {message.text && (
              <p
                className={`text-sm font-medium ${message.type === 'error' ? 'text-destructive' : 'text-green-600'}`}
              >
                {message.text}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? '저장 중...' : '닉네임 수정'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive text-lg">위험 구역</CardTitle>
          <CardDescription>더 이상 서비스를 이용하지 않으시나요?</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            계정을 탈퇴하시면 모든 데이터가 삭제 대기 상태로 전환됩니다.
          </p>
          <Dialog open={isWithdrawDialogOpen} onOpenChange={setIsWithdrawDialogOpen}>
            <DialogTrigger
              render={
                <Button variant="destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  회원 탈퇴
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>정말로 탈퇴하시겠습니까?</DialogTitle>
                <DialogDescription className="space-y-3 py-4">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm flex gap-2">
                    <AlertCircle className="shrink-0 h-4 w-4 mt-0.5" />
                    <span>
                      탈퇴 후 <strong>30일 동안</strong>은 동일 이메일로 재가입이 불가능하며, 30일
                      이내 로그인 시 탈퇴를 취소할 수 있습니다. 30일 경과 후 모든 데이터는 영구
                      삭제됩니다.
                    </span>
                  </div>
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="withdraw-reason" className="text-foreground">
                      탈퇴 사유를 적어주세요.
                    </Label>
                    <Textarea
                      id="withdraw-reason"
                      className="text-base md:text-sm"
                      placeholder="더 나은 서비스를 위해 이유를 알려주세요."
                      value={withdrawalReason}
                      onChange={(e) => setWithdrawalReason(e.target.value)}
                    />
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsWithdrawDialogOpen(false)}>
                  취소
                </Button>
                <Button variant="destructive" onClick={handleWithdraw} disabled={isWithdrawing}>
                  {isWithdrawing ? '처리 중...' : '탈퇴 확정'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
