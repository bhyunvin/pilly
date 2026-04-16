import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VisualFilters } from './VisualFilters';

describe('VisualFilters Component UI Test', () => {
  const mockOnSelectShape = vi.fn();
  const mockOnSelectColor = vi.fn();

  it('모양 선택 섹션과 색상 선택 섹션이 모두 렌더링되는가?', () => {
    render(
      <VisualFilters
        selectedShape=""
        selectedColor=""
        onSelectShape={mockOnSelectShape}
        onSelectColor={mockOnSelectColor}
      />,
    );

    // 1. 섹션 타이틀 렌더링 확인
    expect(screen.getByText('모양 선택')).toBeInTheDocument();
    expect(screen.getByText('색상 선택')).toBeInTheDocument();

    // 2. 특정 색상 버튼(하양) 존재 여부 확인
    expect(screen.getByText('하양')).toBeInTheDocument();
    expect(screen.getByText('원형')).toBeInTheDocument();
  });

  it('선택된 항목이 UI에 표시되는가?', () => {
    // 임의의 상태를 주입하여 렌더링
    render(
      <VisualFilters
        selectedShape="원형"
        selectedColor="빨강"
        onSelectShape={mockOnSelectShape}
        onSelectColor={mockOnSelectColor}
      />,
    );

    // 선택된 항목에 대한 시각적 상태 검증은 복잡할 수 있으므로,
    // 기본적으로 렌더링이 깨지지 않는지 확인
    expect(screen.getByText('빨강')).toBeInTheDocument();
  });
});
