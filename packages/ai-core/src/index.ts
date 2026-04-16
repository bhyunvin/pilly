import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { Medicine } from 'types';

/**
 * Pilly 프로젝트의 핵심 AI 로직을 담당하는 클래스
 * @description LangChain과 Google Gemini 모델을 연동하여 전문적인 복약 가이드 및 의학 정보를 제공합니다.
 */
export class PillyAiCore {
  /**
   * Google Generative AI 모델 인스턴스
   * @private
   * @type {ChatGoogleGenerativeAI}
   */
  private readonly model: ChatGoogleGenerativeAI;

  /**
   * PillyAiCore 인스턴스를 생성합니다.
   * @param {string} apiKey - Google AI SDK API 키
   */
  constructor(apiKey: string) {
    this.model = new ChatGoogleGenerativeAI({
      apiKey: apiKey,
      model: 'gemini-3.1-flash', // 최신 모델 권장
      maxOutputTokens: 2048,
    });
  }

  /**
   * 약물 정보를 바탕으로 AI 복약 가이드를 생성합니다.
   * @description 특정 약물의 이름, 제조사, 용량을 기반으로 복용 시 주의사항 및 보관 방법을 생성합니다.
   * 전문 약사 캐릭터인 '필리(Pilly)'의 페르소나를 사용하여 한국어로 답변합니다.
   *
   * @async
   * @param {Medicine} medicine - 가이드를 생성할 대상 약물 정보 객체
   * @returns {Promise<any>} AI가 생성한 복약 가이드 텍스트
   */
  async getMedicineGuide(medicine: Medicine): Promise<any> {
    const prompt = `당신은 전문 약사 AI '필리(Pilly)'입니다. 
다음 약물에 대한 복용 주의사항과 보관 방법을 한국어로 친절하게 설명해 주세요:
- 약품명: ${medicine.name}
- 제조사: ${medicine.manufacturer}
- 용량: ${medicine.dosage}`;

    const response = await this.model.invoke(prompt);
    return response.content;
  }
}
