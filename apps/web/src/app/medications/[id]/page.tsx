import { ArrowLeft, Pill as PillIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { PillCatalog } from 'types';
import { Badge } from '@/components/ui/badge';
import { apiFetchJson } from '@/lib/api';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

async function getPillDetail(itemSeq: string): Promise<PillCatalog | null> {
  const { data, error } = await apiFetchJson<{ success: boolean; pill?: PillCatalog }>(
    `/api/v1/search/pills/${encodeURIComponent(itemSeq)}`,
    { cache: 'no-store' },
  );

  if (error || !data?.success || !data.pill) {
    return null;
  }

  return data.pill;
}

/**
 * 동적 라우트에 대한 SEO 메타데이터를 생성합니다.
 * @param props - Next.js 라우트 파라미터
 * @returns 동적 메타데이터 객체
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const pill = await getPillDetail(resolvedParams.id);

  if (!pill) {
    return {
      title: '의약품 정보를 찾을 수 없습니다 | Pilly',
      description: '요청하신 의약품 카탈로그 정보가 존재하지 않습니다.',
    };
  }

  const company = pill.entpName || '정보 없음';
  const chart = pill.chart || '식약처 등록 의약품';

  return {
    title: `${pill.itemName} 상세 정보 | Pilly`,
    description: `${pill.itemName}(제조사: ${company}) - ${chart}. Pilly에서 의약품 외형과 식별 정보를 확인하세요.`,
    openGraph: {
      title: `${pill.itemName} - Pilly 복약 가이드`,
      description: `${company} · ${chart}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${pill.itemName} 상세 정보 | Pilly`,
      description: `${company} · ${chart}`,
    },
  };
}

/**
 * 특정 의약품의 상세 정보를 실제 카탈로그 API에서 조회하여 렌더링하는 공개 SEO 페이지입니다.
 */
export default async function MedicationDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const pill = await getPillDetail(resolvedParams.id);

  if (!pill) {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Drug',
    name: pill.itemName,
    description: pill.chart || '식약처 의약품 낱알식별정보',
    manufacturer: pill.entpName
      ? {
          '@type': 'Organization',
          name: pill.entpName,
        }
      : undefined,
    image: pill.itemImage || undefined,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex items-center gap-4">
        <Link
          href="/search"
          className="text-muted-foreground hover:text-primary transition-colors flex items-center justify-center p-2 rounded-full hover:bg-muted"
          aria-label="의약품 검색으로 돌아가기"
        >
          <ArrowLeft size={24} aria-hidden="true" />
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{pill.itemName}</h1>
          <p className="text-sm text-muted-foreground">품목일련번호: {pill.itemSeq}</p>
        </div>
      </div>

      <div className="p-6 bg-card/50 backdrop-blur-sm rounded-xl border shadow-sm space-y-6">
        <div className="flex items-center gap-3 text-primary">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <PillIcon size={20} aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold">약품 식별 및 상세 정보</h2>
        </div>

        {pill.itemImage && (
          <div className="relative w-full max-w-md aspect-4/3 rounded-lg overflow-hidden border bg-muted">
            <Image
              src={pill.itemImage}
              alt={`${pill.itemName} 실물 사진`}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">제조사</p>
            <p className="font-semibold text-lg">{pill.entpName || '정보 없음'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">제형 / 모양</p>
            <p className="font-semibold text-lg">{pill.drugShape || '정보 없음'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">색상</p>
            <div className="flex items-center gap-2 pt-1">
              {pill.colorClass1 ? (
                <Badge variant="outline">{pill.colorClass1}</Badge>
              ) : (
                <span className="text-sm text-muted-foreground">정보 없음</span>
              )}
              {pill.colorClass2 && <Badge variant="outline">{pill.colorClass2}</Badge>}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">분할선 (앞면 / 뒷면)</p>
            <p className="font-medium">
              {pill.lineFront || '-'} / {pill.lineBack || '-'}
            </p>
          </div>
          <div className="md:col-span-2 space-y-1">
            <p className="text-sm font-medium text-muted-foreground">성상</p>
            <p className="font-medium leading-relaxed">
              {pill.chart || '등록된 성상 설명이 없습니다.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
