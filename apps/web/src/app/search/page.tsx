'use client';

import { Info, Loader2, Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { PillCatalog } from 'types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useApi } from '@/hooks/useApi';
import { logger } from '@/utils/logger';

const VisualFilters = dynamic(
  () => import('@/components/search/VisualFilters').then((mod) => mod.VisualFilters),
  {
    loading: () => <div className="h-32 animate-pulse bg-muted rounded-lg" />,
    ssr: false,
  },
);

/**
 * 의약품 통합 검색 페이지 컴포넌트입니다.
 * 이름, 모양, 색상 필터로 검색하고 결과 카드 클릭 시 상세 페이지(`/medications/[id]`)로 이동합니다.
 *
 * @returns 의약품 검색 페이지 렌더링 결과
 */
export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [pills, setPills] = useState<PillCatalog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const { apiFetch } = useApi();

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
        if (!res.ok) {
          throw new Error(`검색 API 오류 (${res.status})`);
        }
        const data = await res.json();

        if (data.success) {
          setPills(data.pills);
          if (data.pills.length === 0) {
            setError('검색 결과가 없습니다. 다른 조건으로 시도해 보세요.');
          }
        } else {
          setError(data.message || '검색 요청 처리 중 오류가 발생했습니다.');
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
      queueMicrotask(() => {
        void handleSearch();
      });
    }
  }, [selectedShape, selectedColor, handleSearch]);

  const renderSearchResults = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-primary" size={40} aria-hidden="true" />
          <p className="text-muted-foreground">의약품 정보를 불러오는 중입니다...</p>
        </div>
      );
    }

    if (pills.length === 0) {
      return (
        <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted/30">
          <Info
            className="mx-auto mb-4 text-muted-foreground opacity-50"
            size={48}
            aria-hidden="true"
          />
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
          <Link
            key={pill.itemSeq}
            href={`/medications/${encodeURIComponent(pill.itemSeq)}`}
            className="block rounded-xl focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            aria-label={`${pill.itemName} 상세 정보 보기`}
          >
            <Card className="overflow-hidden hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer h-full">
              <div className="aspect-4/3 bg-muted relative flex items-center justify-center">
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
                  {pill.entpName || '제조사 정보 없음'} · {pill.chart || '성상 정보 없음'}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
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
                aria-hidden="true"
              />
              <Input
                placeholder="의약품 이름을 입력하세요"
                aria-label="의약품 이름 검색"
                className="pl-10 text-base md:text-sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="animate-spin" size={18} aria-hidden="true" />
              ) : (
                '검색'
              )}
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
            <p className="text-sm text-destructive font-medium" role="alert">
              {error}
            </p>
          )}
        </div>
        {renderSearchResults()}
      </div>
    </div>
  );
}
