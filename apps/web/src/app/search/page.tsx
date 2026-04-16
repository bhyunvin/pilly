'use client';

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/utils/logger';
import Image from 'next/image';
import { useApi } from '@/hooks/useApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, Info } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { Pill } from '@/types/pill';

const VisualFilters = dynamic(
  () => import('@/components/search/VisualFilters').then((mod) => mod.VisualFilters),
  {
    loading: () => <div className="h-32 animate-pulse bg-muted rounded-lg" />,
    ssr: false,
  },
);

/**
 * 의약품 통합 검색 페이지 컴포넌트입니다.
 * 이름, 모양, 색상 등 다양한 필터를 조합하여 식약처 공공 데이터 기반의 의약품 정보를 검색합니다.
 *
 * @returns {JSX.Element} 의약품 검색 페이지 렌더링 결과
 */
export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [pills, setPills] = useState<Pill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const { apiFetch } = useApi();

  /**
   * 설정된 검색 조건(이름, 모양, 색상)에 따라 의약품 정보를 비동기로 검색합니다.
   *
   * @async
   * @param e - 폼 제출 이벤트 객체 (선택사항)
   */
  const handleSearch = useCallback(
    async (e?: React.SyntheticEvent) => {
      e?.preventDefault();
      if (!query && !selectedShape && !selectedColor) return;

      try {
        setIsLoading(true);
        setError(null);

        const searchParams = new URLSearchParams();
        if (query) searchParams.append('name', query);
        if (selectedShape) searchParams.append('shape', selectedShape);
        if (selectedColor) searchParams.append('color', selectedColor);

        const res = await apiFetch(`/search?${searchParams.toString()}`);
        const data = await res.json();

        if (data.success) {
          setPills(data.pills);
          if (data.pills.length === 0) {
            setError('검색 결과가 없습니다. 다른 조건으로 시도해 보세요.');
          }
        }
      } catch (err) {
        logger.error({ err }, 'Search failed');
        setError('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        setIsLoading(false);
      }
    },
    [query, selectedShape, selectedColor, apiFetch],
  );

  useEffect(() => {
    if (selectedShape || selectedColor) {
      handleSearch();
    }
  }, [selectedShape, selectedColor, handleSearch]);

  /**
   * 로딩 상태, 에러 발생 여부 또는 검색 결과 목록을 적절한 UI로 렌더링합니다.
   *
   * @returns {JSX.Element} 현재 상태에 따른 검색 결과 렌더링 결과
   */
  const renderSearchResults = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-primary" size={40} />
          <p className="text-muted-foreground">의약품 정보를 불러오는 중입니다...</p>
        </div>
      );
    }

    if (pills.length === 0) {
      return (
        <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted/30">
          <Info className="mx-auto mb-4 text-muted-foreground opacity-50" size={48} />
          <p className="text-lg font-medium text-muted-foreground">
            {error || '검색 결과가 없습니다.'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            약 이름이나 모양, 색상 등으로 의약품을 검색해 보세요.
          </p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pills.map((pill) => (
          <Card
            key={pill.itemSeq}
            className="overflow-hidden hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer"
          >
            <div className="aspect-[4/3] bg-muted relative flex items-center justify-center">
              {pill.itemImage ? (
                <Image
                  src={pill.itemImage}
                  alt={pill.itemName}
                  fill
                  className="object-cover"
                  unoptimized
                  priority={pills.indexOf(pill) < 3}
                />
              ) : (
                <div className="text-muted-foreground text-sm flex flex-col items-center gap-2">
                  <div className="w-12 h-12 bg-muted-foreground/20 rounded-full animate-pulse" />
                  이미지 준비 중
                </div>
              )}
            </div>
            <CardHeader className="p-4">
              <CardTitle className="text-base line-clamp-1">{pill.itemName}</CardTitle>
              <CardDescription className="text-xs line-clamp-1">
                {pill.entpName} · {pill.chart}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">의약품 검색</h1>
        <p className="text-muted-foreground">약 이름, 색상, 모양으로 정확한 정보를 찾으세요.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={18}
              />
              <Input
                placeholder="의약품 이름을 입력하세요"
                className="pl-10 text-base md:text-sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : '검색'}
            </Button>
          </form>

          <VisualFilters
            selectedShape={selectedShape || ''}
            selectedColor={selectedColor || ''}
            onSelectShape={setSelectedShape}
            onSelectColor={setSelectedColor}
          />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">검색 결과 ({pills.length})</h2>
          {error && pills.length > 0 && (
            <p className="text-sm text-destructive font-medium">{error}</p>
          )}
        </div>
        {renderSearchResults()}
      </div>
    </div>
  );
}
