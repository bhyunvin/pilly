import { Elysia } from 'elysia';
import { cron } from '@elysiajs/cron';
import { db } from '../db';
import { userProfiles, userInquiries, inquiryAttachments } from '../db/schema';
import { lt, inArray, eq } from 'drizzle-orm';
import { cloudinaryService } from '../services/cloudinary.service';

const GRACE_PERIOD_DAYS = 30;

export const schedulerPlugin = new Elysia().use(
  cron({
    name: 'user-cleanup',
    pattern: '0 3 * * *', // 매일 새벽 3시
    async run() {
      console.log(`--- Start Hard Deleting Expired Accounts (${GRACE_PERIOD_DAYS} days) ---`);
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() - GRACE_PERIOD_DAYS);

      try {
        // 1. 삭제 대상 유저 조회 (유예 기간 경과)
        const expiredUsers = await db
          .select({ userId: userProfiles.userId })
          .from(userProfiles)
          .where(lt(userProfiles.deletedAt, expirationDate));

        if (expiredUsers.length === 0) {
          console.log('No expired accounts to delete.');
          return;
        }

        const expiredUserIds = expiredUsers.map((u) => u.userId);

        // 2. Cloudinary 물리 파일 삭제 파이프라인 연동
        // 삭제 대상 유저들의 문의 내역에 연결된 첨부파일 URL 목록 확보
        const attachments = await db
          .select({ fileUrl: inquiryAttachments.fileUrl })
          .from(inquiryAttachments)
          .innerJoin(userInquiries, eq(inquiryAttachments.inquiryId, userInquiries.id))
          .where(inArray(userInquiries.userId, expiredUserIds));

        if (attachments.length > 0) {
          console.log(`Found ${attachments.length} orphan files to remove from Cloudinary.`);

          // Cloudinary API Rate Limit(429) 방지를 위한 배치 처리 (50개 단위)
          const BATCH_SIZE = 50;
          for (let i = 0; i < attachments.length; i += BATCH_SIZE) {
            const chunk = attachments.slice(i, i + BATCH_SIZE);
            await Promise.allSettled(
              chunk.map(async (att) => {
                const publicId = cloudinaryService.extractPublicIdFromUrl(att.fileUrl);
                if (publicId) {
                  try {
                    await cloudinaryService.deleteFile(publicId);
                    console.log(`Cloudinary Physical File Removed: ${publicId}`);
                  } catch (err) {
                    console.error(`Failed to delete file from Cloudinary (${publicId}):`, err);
                  }
                }
              }),
            );
          }
        }

        // 3. DB 완전 삭제 (Hard Delete) 실행
        // 외래키 ON DELETE CASCADE 설정에 의해 연관된 상담 기록, 문의 내역, 첨부파일 메타데이터 등이 자동 파기됨
        const deleted = await db
          .delete(userProfiles)
          .where(inArray(userProfiles.userId, expiredUserIds))
          .returning({ id: userProfiles.userId });

        console.log(
          `Successfully hard deleted ${deleted.length} database records and synchronized physical storage.`,
        );
      } catch (err) {
        console.error('CRITICAL: Error during hard deletion sync:', err);
      }
      console.log('--- End Hard Deleting ---');
    },
  }),
);
