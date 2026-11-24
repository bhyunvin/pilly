import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VisualFilters } from './VisualFilters';

/**
 * @description VisualFilters 컴포넌트의 UI 및 선택/해제 콜백 동작을 검증하는 테스트 스위트입니다.
 */
describe('VisualFilters Component UI Test', () => {
  const mockOnSelectShape = vi.fn();
  const mockOnSelectColor = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('모양 선택 섹션과 색상 선택 섹션이 모두 렌더링되는가?', () => {
    render(
      <VisualFilters
        selectedShape=""
        selectedColor=""
        onSelectShape={mockOnSelectShape}
        onSelectColor={mockOnSelectColor}
      />,
    );

    expect(screen.getByText('모양 선택')).toBeInTheDocument();
    expect(screen.getByText('색상 선택')).toBeInTheDocument();
    expect(screen.getByText('하양')).toBeInTheDocument();
    expect(screen.getByText('원형')).toBeInTheDocument();
  });

  it('선택된 항목이 UI에 표시되는가?', () => {
    render(
      <VisualFilters
        selectedShape="원형"
        selectedColor="빨강"
        onSelectShape={mockOnSelectShape}
        onSelectColor={mockOnSelectColor}
      />,
    );

    expect(screen.getByText('빨강')).toBeInTheDocument();
  });

  it('모양과 색상을 클릭하면 선택 콜백이 호출되고, 이미 선택된 항목을 재클릭하면 빈 문자열로 해제된다', () => {
    const { rerender } = render(
      <VisualFilters
        selectedShape=""
        selectedColor=""
        onSelectShape={mockOnSelectShape}
        onSelectColor={mockOnSelectColor}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '원형' }));
    expect(mockOnSelectShape).toHaveBeenCalledWith('원형');

    fireEvent.click(screen.getByRole('button', { name: '하양' }));
    expect(mockOnSelectColor).toHaveBeenCalledWith('하양');

    rerender(
      <VisualFilters
        selectedShape="원형"
        selectedColor="빨강"
        onSelectShape={mockOnSelectShape}
        onSelectColor={mockOnSelectColor}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '원형' }));
    expect(mockOnSelectShape).toHaveBeenLastCalledWith('');

    fireEvent.click(screen.getByRole('button', { name: '빨강' }));
    expect(mockOnSelectColor).toHaveBeenLastCalledWith('');
  });
});
