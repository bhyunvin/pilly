import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { Medicine } from 'types';

export class PillyAiCore {
  private model: ChatGoogleGenerativeAI;

  constructor(apiKey: string) {
    this.model = new ChatGoogleGenerativeAI({
      apiKey: apiKey,
      model: 'gemini-3.1-flash', // 최신 모델 권장
      maxOutputTokens: 2048,
    });
  }

  async getMedicineGuide(medicine: Medicine): Promise<string | any> {
    const prompt = `당신은 전문 약사 AI '필리(Pilly)'입니다. 
다음 약물에 대한 복용 주의사항과 보관 방법을 한국어로 친절하게 설명해 주세요:
- 약품명: ${medicine.name}
- 제조사: ${medicine.manufacturer}
- 용량: ${medicine.dosage}`;

    const response = await this.model.invoke(prompt);
    return response.content;
  }
}
