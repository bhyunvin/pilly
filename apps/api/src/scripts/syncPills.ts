import { db } from '../db';
import { pillCatalog } from '../db/schema';
import { sql } from 'drizzle-orm';
import { logger } from '../utils/logger';

/**
 * 공공 데이터 API에서 반환되는 개별 약물 항목의 구조입니다.
 */
interface PillItem {
  /** 품목 일련번호 */
  ITEM_SEQ: string;
  /** 품목명 */
  ITEM_NAME: string;
  /** 업체명 */
  ENTP_NAME: string;
  /** 성상 */
  CHART: string;
  /** 의약품 모양 */
  DRUG_SHAPE: string;
  /** 색상 (앞) */
  COLOR_CLASS1: string;
  /** 색상 (뒤) */
  COLOR_CLASS2: string;
  /** 분할선 (앞) */
  LINE_FRONT: string;
  /** 분할선 (뒤) */
  LINE_BACK: string;
  /** 품목 이미지 URL */
  ITEM_IMAGE: string;
}

/**
 * 공공 데이터 API의 전체 응답 구조입니다.
 */
interface PillApiResponse {
  body?: {
    items?: PillItem[];
  };
}

/**
 * 공공 데이터 포털의 의약품 개요 정보를 활용하여 데이터베이스를 업데이트합니다.
 *
 * @description
 * 식품의약품안전처에서 제공하는 의약품 낱알 식별 정보를 페이징하여 가져온 뒤,
 * 데이터베이스의 `pill_catalog` 테이블에 삽입하거나 업데이트(Upsert)합니다.
 * 대량의 데이터를 처리하기 위해 페이지당 100개씩 배치 처리를 수행하며,
 * API 서버의 부하를 줄이기 위해 각 요청 사이에 100ms의 지연 시간을 둡니다.
 *
 * @async
 * @returns {Promise<void>}
 * @throws {Error} API 요청 실패 또는 DB 작업 중 오류 발생 시 에러를 던집니다.
 */
export async function updatePillDatabase() {
  logger.info('💊 Starting Pill Database Sync...');

  const apiKey = process.env.DATA_GO_KR_API_KEY;
  const endpoint = process.env.DATA_GO_KR_ENDPOINT;

  if (!apiKey || !endpoint) {
    logger.error('❌ Sync Failed: Missing API configuration');
    return;
  }

  let pageNo = 1;
  const numOfRows = 100;
  let hasMore = true;

  try {
    while (hasMore) {
      logger.info(`📡 Fetching page ${pageNo}...`);

      const url = new URL(endpoint);
      url.searchParams.append('serviceKey', apiKey);
      url.searchParams.append('type', 'json');
      url.searchParams.append('numOfRows', numOfRows.toString());
      url.searchParams.append('pageNo', pageNo.toString());
      url.searchParams.append('stdt', '2000');

      const response = await fetch(url.toString());
      if (!response.ok) {
        break;
      }

      const pillApiResponseData = (await response.json()) as PillApiResponse;
      const pillItems = pillApiResponseData.body?.items || [];

      if (pillItems.length === 0) {
        break;
      }

      const values = pillItems.map((pillItem) => ({
        itemSeq: pillItem.ITEM_SEQ,
        itemName: pillItem.ITEM_NAME,
        entpName: pillItem.ENTP_NAME,
        chart: pillItem.CHART,
        drugShape: pillItem.DRUG_SHAPE,
        colorClass1: pillItem.COLOR_CLASS1,
        colorClass2: pillItem.COLOR_CLASS2,
        lineFront: pillItem.LINE_FRONT,
        lineBack: pillItem.LINE_BACK,
        itemImage: pillItem.ITEM_IMAGE,
        updatedAt: new Date(),
      }));

      await db
        .insert(pillCatalog)
        .values(values)
        .onConflictDoUpdate({
          target: pillCatalog.itemSeq,
          set: {
            itemName: sql`excluded.item_name`,
            entpName: sql`excluded.entp_name`,
            chart: sql`excluded.chart`,
            drugShape: sql`excluded.drug_shape`,
            colorClass1: sql`excluded.color_class1`,
            colorClass2: sql`excluded.color_class2`,
            lineFront: sql`excluded.line_front`,
            lineBack: sql`excluded.line_back`,
            itemImage: sql`excluded.item_image`,
            updatedAt: new Date(),
          },
        });

      logger.info(`✅ Page ${pageNo} synced (${pillItems.length} items)`);

      if (pillItems.length < numOfRows) {
        hasMore = false;
      } else {
        pageNo++;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.info('✨ Pill Database Sync Completed!');
  } catch (error) {
    logger.error({ err: error }, '❌ Sync Error:');
    throw error;
  }
}
