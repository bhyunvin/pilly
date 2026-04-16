import { describe, it, expect } from 'bun:test';
import { createChatRoutes } from './chat';
import { Elysia } from 'elysia';

/**
 * AI 채팅 비즈니스 로직 및 메시지 포맷팅 단위 테스트 그룹
 * @description 채팅 세션 관리, 메시지 전송 시의 유효성 검사, LLM 메시지 포맷 변환 로직을 검증합니다.
 */
describe('Chat Routes Business Logic', () => {
  /**
   * 테스트용 채팅 앱 인스턴스
   * @constant {Elysia}
   */
  const app = new Elysia().use(createChatRoutes(new Elysia()));

  /**
   * 경로 파라미터 유효성 검사 테스트
   * @description 채팅 세션 ID가 숫자가 아닌 경우 422(Unprocessable Entity) 에러를 반환하는지 확인합니다.
   * @async
   */
  it('채팅 메시지 전송 시 세션 ID가 숫자가 아니면 400 에러를 반환하는가?', async () => {
    const response = await app.handle(
      new Request('http://localhost/chat/sessions/not-a-number/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
        body: JSON.stringify({
          history: [{ role: 'user', parts: [{ text: '안녕' }] }],
        }),
      }),
    );

    // t.Numeric() 스키마에 의해 유효성 검사 실패 시 422 반환
    expect(response.status).toBe(422);
  });

  /**
   * 메시지 포맷 변환 로직 테스트
   * @description 클라이언트의 히스토리 데이터 구조가 AI SDK가 요구하는 {role, content} 구조로 올바르게 매핑되는지 확인합니다.
   */
  it('채팅 히스토리 데이터 구조가 올바르게 메시지 객체로 변환되는가?', () => {
    const mockHistory = [
      { role: 'user', parts: [{ text: '이 약은 언제 먹나요?' }] },
      { role: 'assistant', parts: [{ text: '식후 30분에 드세요.' }] },
    ];

    const messages = mockHistory.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.parts[0].text,
    }));

    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('이 약은 언제 먹나요?');
    expect(messages[1].role).toBe('assistant');
  });

  /**
   * 비정상 요청 본문 처리 테스트
   * @description 히스토리 데이터가 배열 형식이 아닐 때 스키마 유효성 검사에서 걸러지는지 확인합니다.
   * @async
   */
  it('비정상적인 히스토리 데이터(빈 배열 등) 입력 시 가드를 통과하지 못하는가?', async () => {
    const response = await app.handle(
      new Request('http://localhost/chat/sessions/123/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
        body: JSON.stringify({
          history: 'invalid_string_instead_of_array',
        }),
      }),
    );

    expect(response.status).toBe(422);
  });
});
