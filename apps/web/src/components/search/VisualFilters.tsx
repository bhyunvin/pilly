'use client';

import { cn } from '@/lib/utils';

interface VisualFiltersProps {
  selectedShape: string;
  selectedColor: string;
  onSelectShape: (shape: string) => void;
  onSelectColor: (color: string) => void;
}

const shapes = [
  { name: '원형', class: 'rounded-full w-12 h-12' },
  { name: '타원형', class: 'rounded-[100%] w-16 h-10' },
  { name: '장방형', class: 'rounded-lg w-16 h-8' },
  {
    name: '삼각형',
    class:
      'w-0 h-0 border-l-[24px] border-l-transparent border-r-[24px] border-r-transparent border-b-[42px]',
  },
  { name: '사각형', class: 'rounded-md w-12 h-12' },
  { name: '오각형', class: 'w-12 h-12 clip-path-polygon' }, // Custom clip path would be better but simplified for now
];

const colors = [
  { name: '하양', hex: '#FFFFFF', border: true },
  { name: '노랑', hex: '#FFEB3B' },
  { name: '주황', hex: '#FF9800' },
  { name: '분홍', hex: '#E91E63' },
  { name: '빨강', hex: '#F44336' },
  { name: '초록', hex: '#4CAF50' },
  { name: '파랑', hex: '#2196F3' },
  { name: '보라', hex: '#9C27B0' },
  { name: '갈색', hex: '#795548' },
  { name: '회색', hex: '#9E9E9E' },
  { name: '검정', hex: '#000000' },
];

export function VisualFilters({
  selectedShape,
  selectedColor,
  onSelectShape,
  onSelectColor,
}: VisualFiltersProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-3">모양 선택</h3>
        <div className="flex flex-wrap items-center gap-4">
          {shapes.map((s) => (
            <button
              key={s.name}
              onClick={() => onSelectShape(selectedShape === s.name ? '' : s.name)}
              className="flex flex-col items-center gap-1 group"
            >
              <div
                className={cn(
                  s.class,
                  'border-2 transition-all flex items-center justify-center',
                  selectedShape === s.name
                    ? 'border-primary bg-primary/10 ring-2 ring-primary ring-offset-2'
                    : 'border-muted bg-muted/20 group-hover:border-primary/50',
                  s.name === '삼각형' &&
                    (selectedShape === s.name ? 'border-b-primary' : 'border-b-muted'),
                )}
                style={
                  s.name === '삼각형'
                    ? {
                        borderLeftColor: 'transparent',
                        borderRightColor: 'transparent',
                        width: 0,
                        height: 0,
                        backgroundColor: 'transparent',
                      }
                    : {}
                }
              />
              <span className="text-xs">{s.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">색상 선택</h3>
        <div className="flex flex-wrap gap-3">
          {colors.map((c) => (
            <button
              key={c.name}
              onClick={() => onSelectColor(selectedColor === c.name ? '' : c.name)}
              className="flex flex-col items-center gap-1"
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-full border-2 transition-all',
                  selectedColor === c.name
                    ? 'ring-2 ring-primary ring-offset-2 scale-110'
                    : 'hover:scale-105',
                  c.border ? 'border-muted' : 'border-transparent',
                )}
                style={{ backgroundColor: c.hex }}
              />
              <span className="text-[10px]">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
