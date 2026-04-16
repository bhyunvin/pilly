import { Elysia, t } from 'elysia';
import { db } from '../db';
import { userInquiries, inquiryAttachments } from '../db/schema';
import { authPlugin } from '../middleware/auth';
import { cloudinaryService } from '../services/cloudinary.service';
import { eq, desc } from 'drizzle-orm';

/**
 * 1:1 문의 라우트 팩토리 함수
 */
export const createInquiryRoutes = (app: Elysia) => {
  return app.group('/inquiry', (group) =>
    group
      .use(authPlugin)

      .post(
        '/',
        async ({ body, userId, set }) => {
          const { title, content, chat_session_id, allow_chat_access, attachments } = body;

          const [inquiry] = await db
            .insert(userInquiries)
            .values({
              userId,
              title,
              content,
              chatSessionId: chat_session_id ? Number(chat_session_id) : null,
              allowChatAccess: allow_chat_access === 'true',
            })
            .returning();

          if (attachments && attachments.length > 0) {
            const uploadPromises = attachments.map(async (file: File) => {
              const uploadResult = await cloudinaryService.uploadFile(file, 'inquiries');

              await db.insert(inquiryAttachments).values({
                inquiryId: inquiry.id,
                fileUrl: uploadResult.secure_url,
                originalName: file.name,
              });
            });

            await Promise.all(uploadPromises);
          }

          set.status = 201;
          return { success: true, inquiryId: inquiry.id };
        },
        {
          body: t.Object({
            title: t.String(),
            content: t.String(),
            chat_session_id: t.Optional(t.String()),
            allow_chat_access: t.Optional(t.String()),
            attachments: t.Optional(t.Array(t.File())),
          }),
          detail: {
            summary: '1:1 문의 등록',
            description:
              '사용자의 문의 사항을 등록합니다. 채팅 세션 연동 및 다중 파일 첨부를 지원합니다.',
            tags: ['Inquiry'],
          },
        },
      )

      .get(
        '/list',
        async ({ userId }) => {
          return await db
            .select()
            .from(userInquiries)
            .where(eq(userInquiries.userId, userId))
            .orderBy(desc(userInquiries.createdAt));
        },
        {
          detail: {
            summary: '나의 문의 내역 조회',
            description: '본인이 작성한 1:1 문의 목록을 최신순으로 가져옵니다.',
            tags: ['Inquiry'],
          },
        },
      ),
  );
};
