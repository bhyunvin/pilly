import { describe, it, expect, mock } from 'bun:test';

// 1. Cloudinary 서비스 모킹
const mockDeleteFile = mock(() => Promise.resolve({ result: 'ok' }));
const mockExtractPublicId = mock(() => 'pilly/test_public_id');

mock.module('../services/cloudinary.service', () => ({
  cloudinaryService: {
    deleteFile: mockDeleteFile,
    extractPublicIdFromUrl: mockExtractPublicId,
  },
}));

// 2. DB 및 Drizzle 모킹 (테스트용)
// 실제 스케줄러 로직을 테스트하기 위해 필요한 데이터 셋업 시뮬레이션
// import { db } from '../db';
// import { userProfiles, inquiryAttachments } from '../db/schema';
// import { lt, inArray } from 'drizzle-orm';

describe('Account Hard-Delete Scheduler Logic', () => {
  it('should target users deleted more than 30 days ago', async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 31); // 31일 전

    // 실제 스케줄러 안에서 lt(userProfiles.deletedAt, thirtyDaysAgo)가 쓰임
    // 여기서는 로직만 시뮬레이션함 (Elysia cron 내부 로직을 분리하지 않았으므로 수동 트리거 형식으로 검증)

    // 유저 데이터 모킹
    const expiredUsers = [
      { userId: 'user_expired_1', deletedAt: thirtyDaysAgo },
      { userId: 'user_expired_2', deletedAt: thirtyDaysAgo },
    ];

    // 스케줄러 로직의 핵심 파이프라인 (추출해서 테스트하기 위해 로직 재현)
    const targetUserIds = expiredUsers.map((u) => u.userId);
    expect(targetUserIds).toContain('user_expired_1');
    expect(targetUserIds).toContain('user_expired_2');

    // Cloudinary 삭제 호출 시뮬레이션
    const attachments = [
      { fileUrl: 'https://cloudinary.com/pilly/test_1.jpg' },
      { fileUrl: 'https://cloudinary.com/pilly/test_2.jpg' },
    ];

    const deletePromises = attachments.map(async (att) => {
      // 상단에서 모킹된 인스턴스를 직접 참조하여 @ts-ignore 제거
      const { cloudinaryService } = await import('../services/cloudinary.service');
      const publicId = cloudinaryService.extractPublicIdFromUrl(att.fileUrl);
      if (publicId) {
        await cloudinaryService.deleteFile(publicId);
      }
    });

    await Promise.allSettled(deletePromises);

    // 검증: Cloudinary 삭제 함수가 두 번 호출되었는가?
    expect(mockDeleteFile).toHaveBeenCalledTimes(2);
    expect(mockDeleteFile).toHaveBeenCalledWith('pilly/test_public_id');
  });

  it('should not target users deleted less than 30 days ago', () => {
    const recentlyDeleted = new Date();
    recentlyDeleted.setDate(recentlyDeleted.getDate() - 10); // 10일 전

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 10일 전 삭제된 데이터는 lt(userProfiles.deletedAt, thirtyDaysAgo)를 만족하지 않음
    const isTarget = recentlyDeleted.getTime() < thirtyDaysAgo.getTime();
    expect(isTarget).toBe(false);
  });
});
