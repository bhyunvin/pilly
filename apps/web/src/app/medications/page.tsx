'use client';

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit2,
  History,
  Loader2,
  Pill as PillIcon,
  Plus,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { MedicationHistoryItem, MedicationStatus, UserMedication } from 'types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApi } from '@/hooks/useApi';
import { logger } from '@/utils/logger';

const EMPTY_MEDICATION_FORM = { name: '', dosage: '', frequency: '' };
const MAX_VISIBLE_HISTORY = 10;

/**
 * 사용자별 복약 정보 관리 페이지 컴포넌트입니다.
 * 약물 추가/수정/삭제, 오늘 복용 완료·건너뛰기 체크 및 복약 이력 펼침 조회 기능을 제공합니다.
 *
 * @returns 복약 정보 관리 페이지 렌더링 결과
 */
export default function MedicationsPage() {
  const [medications, setMedications] = useState<UserMedication[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newMed, setNewMed] = useState(EMPTY_MEDICATION_FORM);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_MEDICATION_FORM);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [recordingId, setRecordingId] = useState<number | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  const [historyMap, setHistoryMap] = useState<Record<number, MedicationHistoryItem[]>>({});
  const [loadingHistoryId, setLoadingHistoryId] = useState<number | null>(null);

  const { apiFetch } = useApi();

  const fetchMedications = useCallback(async () => {
    try {
      setIsFetching(true);
      const res = await apiFetch('/medications');
      if (!res.ok) {
        throw new Error('복약 목록 조회 실패');
      }
      const data = await res.json();
      if (data.success) {
        setMedications(data.medications);
      }
    } catch (err) {
      logger.error({ err }, '복약 목록 조회 중 오류 발생');
    } finally {
      setIsFetching(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchMedications();
    });
  }, [fetchMedications]);

  const handleAdd = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!newMed.name.trim()) return;

    try {
      setIsSubmitting(true);
      const res = await apiFetch('/medications', {
        method: 'POST',
        body: JSON.stringify(newMed),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMedications((prev) => [data.medication, ...prev]);
        setNewMed(EMPTY_MEDICATION_FORM);
      } else {
        alert(data.message || '복약 정보 추가에 실패했습니다.');
      }
    } catch (err) {
      logger.error({ err }, '복약 정보 추가 중 오류 발생');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (med: UserMedication) => {
    setEditingId(med.id);
    setEditDraft({
      name: med.name,
      dosage: med.dosage || '',
      frequency: med.frequency || '',
    });
  };

  const handleSaveEdit = async (id: number) => {
    if (!editDraft.name.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      const res = await apiFetch(`/medications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(editDraft),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMedications((prev) => prev.map((m) => (m.id === id ? data.medication : m)));
        setEditingId(null);
      } else {
        alert(data.message || '복약 정보 수정에 실패했습니다.');
      }
    } catch (err) {
      logger.error({ err }, '복약 정보 수정 중 오류 발생');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const res = await apiFetch(`/medications/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMedications((prev) => prev.filter((m) => m.id !== id));
        if (expandedHistoryId === id) {
          setExpandedHistoryId(null);
        }
      }
    } catch (err) {
      logger.error({ err }, '복약 정보 삭제 중 오류 발생');
    }
  };

  const fetchHistoryForMedication = useCallback(
    async (medicationId: number) => {
      setLoadingHistoryId(medicationId);
      try {
        const res = await apiFetch(`/medications/${medicationId}/history`);
        if (!res.ok) throw new Error('이력 조회 실패');
        const data = (await res.json()) as { success: boolean; history: MedicationHistoryItem[] };
        if (data.success) {
          setHistoryMap((prev) => ({ ...prev, [medicationId]: data.history }));
        }
      } catch (err) {
        logger.error({ err }, '복약 이력 조회 실패');
      } finally {
        setLoadingHistoryId(null);
      }
    },
    [apiFetch],
  );

  const handleToggleHistory = async (medicationId: number) => {
    if (expandedHistoryId === medicationId) {
      setExpandedHistoryId(null);
      return;
    }
    setExpandedHistoryId(medicationId);
    await fetchHistoryForMedication(medicationId);
  };

  const handleRecordHistory = async (medicationId: number, status: MedicationStatus) => {
    if (recordingId !== null) return;
    setRecordingId(medicationId);
    try {
      const res = await apiFetch(`/medications/${medicationId}/history`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHistoryMap((prev) => ({
          ...prev,
          [medicationId]: [data.data, ...(prev[medicationId] ?? [])],
        }));
      } else {
        alert(data.message || '복약 체크 기록에 실패했습니다.');
      }
    } catch (err) {
      logger.error({ err }, '복약 체크 기록 오류');
    } finally {
      setRecordingId(null);
    }
  };

  const renderHistoryStatusBadge = (status?: MedicationStatus | null) => {
    if (status === 'COMPLETED') {
      return <Badge variant="secondary">복용 완료</Badge>;
    }
    if (status === 'SKIPPED') {
      return <Badge variant="outline">건너뜀</Badge>;
    }
    return <Badge variant="outline">대기</Badge>;
  };

  const renderMedicationHistory = (
    medicationId: number,
    historyItems: MedicationHistoryItem[],
  ): React.ReactNode => {
    if (loadingHistoryId === medicationId) {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          이력을 불러오는 중...
        </div>
      );
    }

    if (historyItems.length === 0) {
      return <p className="text-xs text-muted-foreground">기록된 복약 이력이 없습니다.</p>;
    }

    return (
      <ul className="space-y-1.5 max-h-40 overflow-y-auto">
        {historyItems.slice(0, MAX_VISIBLE_HISTORY).map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between text-xs bg-muted/40 rounded px-2.5 py-1.5"
          >
            {renderHistoryStatusBadge(item.status)}
            <span className="text-muted-foreground">
              {item.takenAt ? new Date(item.takenAt).toLocaleString('ko-KR') : '-'}
            </span>
          </li>
        ))}
      </ul>
    );
  };

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
        {medications.map((med) => {
          const isEditing = editingId === med.id;
          const isHistoryOpen = expandedHistoryId === med.id;
          const historyItems = historyMap[med.id] ?? [];

          return (
            <Card key={med.id} className="relative hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <PillIcon size={20} aria-hidden="true" />
                  </div>
                  {isEditing ? (
                    <div className="flex-1 space-y-2">
                      <div>
                        <Label htmlFor={`edit-name-${med.id}`} className="sr-only">
                          약물 이름 수정
                        </Label>
                        <Input
                          id={`edit-name-${med.id}`}
                          value={editDraft.name}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                          className="h-8 text-base md:text-sm"
                          placeholder="약물 이름"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={editDraft.dosage}
                          onChange={(e) => setEditDraft({ ...editDraft, dosage: e.target.value })}
                          className="h-8 text-base md:text-sm"
                          placeholder="용량"
                          aria-label="용량 수정"
                        />
                        <Input
                          value={editDraft.frequency}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, frequency: e.target.value })
                          }
                          className="h-8 text-base md:text-sm"
                          placeholder="복용 빈도"
                          aria-label="복용 빈도 수정"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleSaveEdit(med.id)}
                          disabled={isSavingEdit || !editDraft.name.trim()}
                        >
                          {isSavingEdit ? '저장 중...' : '저장'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          aria-label="수정 취소"
                        >
                          <X size={14} aria-hidden="true" />
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <CardTitle className="text-lg truncate">{med.name}</CardTitle>
                      <CardDescription>
                        {med.dosage || '-'} · {med.frequency || '-'}
                      </CardDescription>
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleStartEdit(med)}
                      aria-label={`${med.name} 수정`}
                      className="text-muted-foreground hover:text-primary"
                    >
                      <Edit2 size={16} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(med.id)}
                      aria-label={`${med.name} 삭제`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </CardHeader>

              <CardContent className="pt-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleRecordHistory(med.id, 'COMPLETED')}
                    disabled={recordingId === med.id}
                    aria-label={`${med.name} 오늘 복용 완료 기록`}
                    className="gap-1.5"
                  >
                    <CheckCircle2 size={15} className="text-green-600" aria-hidden="true" />
                    오늘 복용 완료
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRecordHistory(med.id, 'SKIPPED')}
                    disabled={recordingId === med.id}
                    aria-label={`${med.name} 건너뛰기 기록`}
                    className="gap-1.5 text-muted-foreground"
                  >
                    <SkipForward size={15} aria-hidden="true" />
                    건너뛰기
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggleHistory(med.id)}
                    aria-expanded={isHistoryOpen}
                    aria-label={`${med.name} 복약 이력 ${isHistoryOpen ? '접기' : '보기'}`}
                    className="ml-auto gap-1 text-xs text-muted-foreground"
                  >
                    <History size={14} aria-hidden="true" />
                    이력
                    {isHistoryOpen ? (
                      <ChevronUp size={14} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={14} aria-hidden="true" />
                    )}
                  </Button>
                </div>

                {isHistoryOpen && (
                  <div className="border-t pt-3 space-y-2">
                    {renderMedicationHistory(med.id, historyItems)}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">내 복약 정보</h1>
        <p className="text-muted-foreground">
          현재 복용 중인 약물을 기록하고 복용 이력을 관리하세요.
        </p>
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
              disabled={isSubmitting || !newMed.name.trim()}
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin mr-2" size={16} aria-hidden="true" />
              ) : (
                <Plus className="mr-2" size={16} aria-hidden="true" />
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
