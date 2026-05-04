import { Metadata } from 'next';
import { Pill as PillIcon, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

/**
 * 예시(Mock) 데이터를 가져오는 비동기 함수.
 * 실제 서비스에서는 DB 또는 외부 API를 통해 의약품 정보를 가져와야 합니다.
 */
async function getDrugInfo(id: string) {
  // 예시 데이터
  return {
    id,
    name: '아스피린 500mg',
    activeIngredient: 'Aspirin',
    description: '해열, 진통, 소염제',
    manufacturer: 'Pilly Pharma',
  };
}

/**
 * 동적 라우트에 대한 메타데이터를 생성합니다.
 * @param props - Next.js 라우트 파라미터
 * @returns 동적 메타데이터 객체
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const drug = await getDrugInfo(resolvedParams.id);

  return {
    title: `${drug.name} 상세 정보 | Pilly`,
    description: `${drug.name}(성분: ${drug.activeIngredient})에 대한 효능, 복용법, 부작용 정보를 확인하세요.`,
    openGraph: {
      title: `${drug.name} - Pilly 복약 가이드`,
      description: `${drug.name}의 상세 정보를 Pilly에서 확인하고 안전하게 복용하세요.`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${drug.name} 상세 정보 | Pilly`,
      description: `${drug.name}의 안전한 복용을 위한 가이드`,
    },
  };
}

/**
 * 특정 의약품의 상세 정보를 보여주고 SEO/AIO 최적화를 위해 JSON-LD를 삽입하는 페이지입니다.
 */
export default async function MedicationDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const drug = await getDrugInfo(resolvedParams.id);

  // Schema.org 'Drug' 타입 기반의 JSON-LD 객체
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Drug',
    name: drug.name,
    activeIngredient: drug.activeIngredient,
    description: drug.description,
    manufacturer: {
      '@type': 'Organization',
      name: drug.manufacturer,
    },
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      {/* 검색 엔진 및 AI 모델에게 구조화된 데이터를 제공하는 JSON-LD 스크립트 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex items-center gap-4">
        <Link
          href="/medications"
          className="text-muted-foreground hover:text-primary transition-colors flex items-center justify-center p-2 rounded-full hover:bg-muted"
        >
          <ArrowLeft size={24} />
          <span className="sr-only">목록으로 돌아가기</span>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">{drug.name}</h1>
      </div>

      <div className="p-6 bg-card/50 backdrop-blur-sm rounded-xl border shadow-sm space-y-4">
        <div className="flex items-center gap-3 text-primary">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <PillIcon size={20} aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold">약품 상세 정보</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">성분명</p>
            <p className="font-semibold text-lg">{drug.activeIngredient}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">제조사</p>
            <p className="font-semibold text-lg">{drug.manufacturer}</p>
          </div>
          <div className="md:col-span-2 space-y-1">
            <p className="text-sm font-medium text-muted-foreground">효능/효과</p>
            <p className="font-medium leading-relaxed">{drug.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
