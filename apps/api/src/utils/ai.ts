import { google } from '@ai-sdk/google';
import { generateText, Output } from 'ai';
import { z } from 'zod';

/**
 * AI 모델 관련 유틸리티 및 상수 정의
 */

export const MODELS = {
  FLASH: 'gemini-3.1-flash',
  PRO: 'gemini-3.1-pro',
} as const;

/**
 * 모델별 시스템 프롬프트 정의
 */
export const SYSTEM_PROMPTS = {
  FLASH: `당신은 전문 약사 AI "Pilly"입니다. 
사용자의 건강 상태와 약물 정보를 바탕으로 빠르고 간결하며 친절하게 복약 지도를 수행하세요. 
일반적인 질문에는 핵심 위주로 답변하며, 사용자가 편안하게 정보를 얻을 수 있도록 돕습니다.`,

  PRO: `당신은 전문 약사 AI "Pilly"입니다. 
현재 복잡한 의학적 분석이나 상호작용 검증이 필요한 상황입니다. 다음의 엄격한 가이드라인을 준수하세요:

1. **최종 진단 금지**: 사용자의 증상을 기반으로 절대 최종적인 의학적 진단을 내리지 마세요. 항상 "정확한 진단은 의사의 진찰이 필요함"을 상기시키세요.
2. **보수적 접근**: 의약품 간 상호작용이나 부작용에 대해 매우 보수적으로 접근하고, 잠재적 위험 가능성을 엄격히 고지하세요.
3. **근거 중심 답변**: 답변은 전문적이며 근거 중심적이어야 합니다.
4. **할루시네이션 방지**: 확실하지 않은 정보나 데이터가 부족한 경우 주저하지 말고 "확인이 필요하다"거나 "전문가와 상담하라"고 명시하세요.
5. **가드레일**: 위험한 약물 오남용 징후가 보일 경우 즉시 응급 의료 기관 방문을 권고하세요.`,
};

/**
 * 사용자 입력(Prompt)을 분석하여 적절한 AI 모델을 결정합니다.
 * @description 경량 모델(Flash)을 사용하여 질문의 복잡도를 먼저 분류(Binary Classification)합니다.
 *
 * @param prompt 사용자 입력 메시지
 * @returns Promise<'gemini-3.1-flash' | 'gemini-3.1-pro'>
 */
export const determineAIModel = async (prompt: string): Promise<string> => {
  try {
    const { output: object } = await generateText({
      model: google(MODELS.FLASH),
      output: Output.object({
        schema: z.object({
          complexity: z.enum(['simple', 'complex']).describe('질문의 복잡도 분류'),
          reasoning: z.string().describe('분류 근거'),
        }),
      }),
      system: `당신은 약학 상담 질문의 복잡도를 분류하는 전문가입니다.
사용자의 질문이 다음 중 어디에 해당하는지 판단하세요:
- 'simple': 인사, 일상적인 대화, 단순한 감정 표현, 매우 간단한 약 이름 확인 등.
- 'complex': 증상 설명, 부작용 문의, 약물 간 상호작용 문의, 질환 관련 상담, 전문적인 복용량 가이드 요청 등.`,
      prompt: `사용자 질문: "${prompt}"`,
    });

    console.log(`[AI Classifier] Complexity: ${object.complexity}, Reason: ${object.reasoning}`);

    return object.complexity === 'complex' ? MODELS.PRO : MODELS.FLASH;
  } catch (error) {
    console.error('[AI Classifier Error] Fallback to Flash:', error);
    return MODELS.FLASH; // 에러 발생 시 안전하게 Flash로 폴백
  }
};
