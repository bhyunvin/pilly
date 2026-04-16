'use client';

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/utils/logger';
import { useApi } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pill as PillIcon, Plus, Trash2, Loader2 } from 'lucide-react';

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
}

/**
 * 사용자별 복약 정보 관리 페이지 컴포넌트입니다.
 * 현재 복용 중인 약물 목록을 조회하고, 새로운 약물 추가 및 기존 정보 삭제 기능을 제공합니다.
 *
 * @returns {JSX.Element} 복약 정보 관리 페이지 렌더링 결과
 */
export default function MedicationsPage() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newMed, setNewMed] = useState({ name: '', dosage: '', frequency: '' });
  const { apiFetch } = useApi();

  /**
   * 서버로부터 사용자의 복약 목록을 비동기로 가져옵니다.
   *
   * @async
   * @function fetchMedications
   */
  const fetchMedications = useCallback(async () => {
    try {
      setIsFetching(true);
      const res = await apiFetch('/medications');
      const data = await res.json();
      if (data.success) {
        setMedications(data.medications);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to fetch medications');
    } finally {
      setIsFetching(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchMedications();
  }, [fetchMedications]);

  /**
   * 사용자가 입력한 새로운 복약 정보를 서버에 비동기로 추가합니다.
   *
   * @async
   * @param e - 폼 제출 이벤트 객체
   */
  const handleAdd = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!newMed.name) return;

    try {
      setIsSubmitting(true);
      const res = await apiFetch('/medications', {
        method: 'POST',
        body: JSON.stringify(newMed),
      });
      const data = await res.json();
      if (data.success) {
        setMedications((prev) => [...prev, data.medication]);
        setNewMed({ name: '', dosage: '', frequency: '' });
      }
    } catch (err) {
      logger.error({ err }, 'Failed to add medication');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * 특정 복약 정보를 서버에서 비동기로 삭제합니다.
   *
   * @async
   * @param {string} id - 삭제할 복약 정보의 고유 ID
   */
  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const res = await apiFetch(`/medications/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setMedications((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (err) {
      logger.error({ err }, 'Failed to delete medication');
    }
  };

  /**
   * 로딩 상태 및 데이터 유무에 따라 적절한 UI 컨텐츠를 렌더링합니다.
   *
   * @returns {JSX.Element} 현재 상태에 따른 렌더링 결과
   */
  const renderContent = () => {
    if (isFetching) {
      return (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary" size={32} aria-hidden="true" />
        </div>
      );
    }

    if (medications.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground bg-accent/30 rounded-lg">
          <PillIcon className="mx-auto mb-4 opacity-20" size={48} aria-hidden="true" />
          <p>현재 등록된 복약 정보가 없습니다.</p>
          <p className="text-sm">위의 폼을 통해 복용 중인 약물을 추가해 보세요.</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {medications.map((med) => (
          <Card key={med.id} className="relative group hover:border-primary/50 transition-colors">
            <button
              onClick={() => handleDelete(med.id)}
              className="absolute top-3 right-3 p-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label={`${med.name} 삭제`}
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
            <CardHeader className="flex flex-row items-center gap-4 space-y-0">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <PillIcon size={20} aria-hidden="true" />
              </div>
              <div>
                <CardTitle className="text-lg">{med.name}</CardTitle>
                <CardDescription>
                  {med.dosage} · {med.frequency}
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">내 복약 정보</h1>
        <p className="text-muted-foreground">현재 복용 중인 약물을 기록하고 관리하세요.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">새 약물 추가</CardTitle>
          <CardDescription>복용 중인 약물의 이름과 용법을 입력하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">약물 이름</Label>
              <Input
                id="name"
                className="text-base md:text-sm"
                placeholder="예: 아스피린"
                value={newMed.name}
                onChange={(e) => setNewMed({ ...newMed, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dosage">용량</Label>
              <Input
                id="dosage"
                className="text-base md:text-sm"
                placeholder="예: 500mg"
                value={newMed.dosage}
                onChange={(e) => setNewMed({ ...newMed, dosage: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="frequency">복용 빈도</Label>
              <Input
                id="frequency"
                className="text-base md:text-sm"
                placeholder="예: 1일 1회 식후"
                value={newMed.frequency}
                onChange={(e) => setNewMed({ ...newMed, frequency: e.target.value })}
              />
            </div>
            <Button
              className="md:col-span-3 mt-2"
              type="submit"
              disabled={isSubmitting || !newMed.name}
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin mr-2" size={16} />
              ) : (
                <Plus className="mr-2" size={16} />
              )}
              {isSubmitting ? '저장 중...' : '추가하기'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">복용 중인 약물 ({medications.length})</h2>
        {renderContent()}
      </div>
    </div>
  );
}
