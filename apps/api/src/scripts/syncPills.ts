import { db } from '../db';
import { pillCatalog } from '../db/schema';
import { sql } from 'drizzle-orm';

interface PillItem {
  ITEM_SEQ: string;
  ITEM_NAME: string;
  ENTP_NAME: string;
  CHART: string;
  DRUG_SHAPE: string;
  COLOR_CLASS1: string;
  COLOR_CLASS2: string;
  LINE_FRONT: string;
  LINE_BACK: string;
  ITEM_IMAGE: string;
}

interface PillApiResponse {
  body?: {
    items?: PillItem[];
  };
}

export async function updatePillDatabase() {
  console.log('💊 Starting Pill Database Sync...');

  const apiKey = process.env.DATA_GO_KR_API_KEY;
  const endpoint = process.env.DATA_GO_KR_ENDPOINT;

  if (!apiKey || !endpoint) {
    console.error('❌ Sync Failed: Missing API configuration');
    return;
  }

  let pageNo = 1;
  const numOfRows = 100;
  let hasMore = true;

  try {
    while (hasMore) {
      console.log(`📡 Fetching page ${pageNo}...`);

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

      console.log(`✅ Page ${pageNo} synced (${pillItems.length} items)`);

      if (pillItems.length < numOfRows) {
        hasMore = false;
      } else {
        pageNo++;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log('✨ Pill Database Sync Completed!');
  } catch (error) {
    console.error('❌ Sync Error:', error);
    throw error;
  }
}
