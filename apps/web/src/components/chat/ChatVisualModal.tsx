'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AnalyzedMed {
  name: string;
  dosage: string;
  frequency: string;
  checked?: boolean;
}

interface ChatVisualModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  analyzedMeds: AnalyzedMed[];
  setAnalyzedMeds: (meds: AnalyzedMed[]) => void;
  onConfirm: () => void;
}

/**
 * @description 이미지 인식을 통해 추출된 약품 목록을 사용자에게 확인받고 편집할 수 있게 하는 모달 컴포넌트입니다.
 * 인식된 약품의 이름을 수정하거나, 저장할 약품을 선택할 수 있는 기능을 제공합니다.
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
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>인식된 약품 확인</DialogTitle>
          <DialogDescription>사진에서 아래의 약품들이 인식되었습니다.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-4 py-4">
          {analyzedMeds.map((med, idx) => (
            <div
              key={`${med.name}-${idx}`}
              className="flex items-start space-x-3 border p-3 rounded-lg"
            >
              <Checkbox
                id={`med-check-${idx}`}
                checked={med.checked}
                onCheckedChange={(c) => {
                  const next = [...analyzedMeds];
                  next[idx].checked = c === true;
                  setAnalyzedMeds(next);
                }}
              />
              <div className="flex-1 space-y-2">
                <Input
                  id={`med-name-${idx}`}
                  className="text-base md:text-sm"
                  value={med.name}
                  onChange={(e) => {
                    const next = [...analyzedMeds];
                    next[idx].name = e.target.value;
                    setAnalyzedMeds(next);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={onConfirm}>약통에 추가</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
