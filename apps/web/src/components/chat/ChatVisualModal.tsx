'use client';

import type { AnalyzedMedication } from 'types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ChatVisualModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  analyzedMeds: AnalyzedMedication[];
  setAnalyzedMeds: (meds: AnalyzedMedication[]) => void;
  onConfirm: () => void;
}

/**
 * @description 이미지 인식을 통해 추출된 약품 목록을 사용자에게 확인받고 편집할 수 있게 하는 모달 컴포넌트입니다.
 * 인식된 약품의 이름, 용량, 복용 빈도를 수정하거나 저장할 약품을 선택할 수 있습니다.
 *
 * @param props - 모달 제어 상태, 분석된 약품 목록 및 제어 함수, 확인 콜백
 * @returns 약품 목록 확인 및 편집 폼이 포함된 다이얼로그 모달을 반환합니다.
 */
export function ChatVisualModal({
  isOpen,
  onOpenChange,
  analyzedMeds,
  setAnalyzedMeds,
  onConfirm,
}: Readonly<ChatVisualModalProps>) {
  const updateField = (
    idx: number,
    patch: Partial<Pick<AnalyzedMedication, 'checked' | 'name' | 'dosage' | 'frequency'>>,
  ) => {
    setAnalyzedMeds(analyzedMeds.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>인식된 약품 확인</DialogTitle>
          <DialogDescription>
            사진에서 추출된 약품명, 용량, 복용 빈도를 확인하고 필요 시 수정하세요.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-4 py-4">
          {analyzedMeds.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-6">
              인식된 약품이 없습니다. 다른 사진으로 다시 시도해 주세요.
            </p>
          ) : (
            analyzedMeds.map((med, idx) => {
              const rowKey = med.id ?? `${med.name}-${med.dosage}-${med.frequency}`;
              return (
                <div key={rowKey} className="flex items-start space-x-3 border p-3 rounded-lg">
                  <Checkbox
                    id={`med-check-${rowKey}`}
                    checked={Boolean(med.checked)}
                    onCheckedChange={(c) => updateField(idx, { checked: c === true })}
                    aria-label={`${med.name} 선택`}
                    className="mt-2"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor={`med-name-${rowKey}`} className="text-xs">
                        약품명
                      </Label>
                      <Input
                        id={`med-name-${rowKey}`}
                        className="text-base md:text-sm"
                        value={med.name}
                        onChange={(e) => updateField(idx, { name: e.target.value })}
                        placeholder="약품명"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor={`med-dosage-${rowKey}`} className="text-xs">
                          용량
                        </Label>
                        <Input
                          id={`med-dosage-${rowKey}`}
                          className="text-base md:text-sm"
                          value={med.dosage}
                          onChange={(e) => updateField(idx, { dosage: e.target.value })}
                          placeholder="예: 1정"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`med-frequency-${rowKey}`} className="text-xs">
                          복용 빈도
                        </Label>
                        <Input
                          id={`med-frequency-${rowKey}`}
                          className="text-base md:text-sm"
                          value={med.frequency}
                          onChange={(e) => updateField(idx, { frequency: e.target.value })}
                          placeholder="예: 1일 3회"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" onClick={onConfirm} disabled={analyzedMeds.length === 0}>
            약통에 추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
