import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { Medicine } from 'types';

/**
 * Pilly 프로젝트의 핵심 AI 로직을 담당하는 클래스
 * @description Vercel AI SDK와 Google Gemini 모델을 연동하여 전문적인 복약 가이드 및 의학 정보를 제공합니다.
 * LangChain 의존성을 제거하고 @ai-sdk/google + ai 패키지를 직접 사용합니다.
 */
export class PillyAiCore {
  /**
   * Google AI API 키
   * @private
   */
  private readonly apiKey: string;

  /**
   * PillyAiCore 인스턴스를 생성합니다.
   * @param apiKey - Google AI SDK API 키
   */
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // @ai-sdk/google는 환경변수 GOOGLE_GENERATIVE_AI_API_KEY를 자동으로 참조합니다.
    // 명시적 키 전달이 필요한 경우 createGoogleGenerativeAI({ apiKey })를 사용하세요.
  }

  /**
   * 약물 정보를 바탕으로 AI 복약 가이드를 생성합니다.
   * @description 특정 약물의 이름, 제조사, 용량을 기반으로 복용 시 주의사항 및 보관 방법을 생성합니다.
   * 전문 약사 캐릭터인 '필리(Pilly)'의 페르소나를 사용하여 한국어로 답변합니다.
   *
   * [NOTE]: 복잡한 약물 상호작용 분석이 필요한 경우 google('gemini-3.1-pro')로 교체 검토
   *
   * @async
   * @param medicine - 가이드를 생성할 대상 약물 정보 객체
   * @returns AI가 생성한 복약 가이드 텍스트
   */
  async getMedicineGuide(medicine: Medicine): Promise<string> {
    const { text } = await generateText({
      // [NOTE]: 고도의 추론(약물 상호작용, 금기사항 분석)이 필요한 경우 google('gemini-3.1-pro') 사용 권장
      model: google('gemini-3.1-flash'),
      system:
        '당신은 전문 약사 AI "필리(Pilly)"입니다. 사용자의 질문에 대해 안전하고 전문적인 복약 지도를 한국어로 친절하게 답변하세요.',
      prompt: `다음 약물에 대한 복용 주의사항과 보관 방법을 설명해 주세요:
- 약품명: ${medicine.name}
- 제조사: ${medicine.manufacturer}
- 용량: ${medicine.dosage}`,
    });

    return text;
  }
}
