import { Elysia, t } from 'elysia';
import { db } from '../db';
import { userInquiries, inquiryAttachments } from '../db/schema';
import { authPlugin } from '../middleware/auth';
import { cloudinaryService } from '../services/cloudinary.service';
import { eq, desc } from 'drizzle-orm';

/**
 * 1:1 문의 라우트 팩토리 함수
 * @description 사용자의 고객 문의 사항을 접수하고, 관련 파일 첨부 및 채팅 세션 접근 권한 설정을 관리합니다.
 * @param {Elysia} app - Elysia 애플리케이션 인스턴스
 * @returns {Elysia} 문의 라우트 그룹이 추가된 인스턴스
 */
export const createInquiryRoutes = (app: Elysia) => {
  return app.group('/inquiry', (group) =>
    group
      .use(authPlugin)

      /**
       * 1:1 문의 등록
       * @description 문의 제목, 내용과 함께 채팅 세션 연동 여부 및 다중 첨부 파일을 처리합니다.
       * 1. 문의 기본 정보를 DB에 저장합니다.
       * 2. 첨부 파일이 있는 경우 Cloudinary에 업로드 후 URL을 DB에 기록합니다.
       * 3. 'allow_chat_access'가 true인 경우, 관리자가 관련 채팅 로그를 열람할 수 있도록 설정됩니다.
       *
       * @async
       * @param {Object} context - 요청 컨텍스트
       * @param {Object} context.body - 문의 등록 데이터 (title, content, chat_session_id, allow_chat_access, attachments)
       * @param {string} context.userId - 인증된 사용자 ID
       * @param {Object} context.set - 응답 상태 설정 객체
       * @returns {Promise<{success: boolean, inquiryId: number}>} 생성된 문의 ID
       */
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

      /**
       * 사용자의 문의 내역 리스트 조회
       * @description 본인이 작성한 모든 문의 내역을 최신순으로 가져옵니다.
       * @async
       * @param {Object} context - 요청 컨텍스트
       * @param {string} context.userId - 인증된 사용자 ID
       * @returns {Promise<Array<Object>>} 문의 내역 목록
       */
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
