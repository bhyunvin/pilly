import { describe, it, expect } from 'bun:test';
import { stripForTts } from './tts';

describe('TTS Text Stripping Logic', () => {
  it('should remove complex markdown symbols and headers', () => {
    const markdown = '# 제목\n## 부제목\n**굵게** 표시된 *기울임* 텍스트';
    const result = stripForTts(markdown);
    expect(result).toBe('제목 부제목 굵게 표시된 기울임 텍스트');
  });

  it('should strip HTML tags correctly', () => {
    const html = '<div>이 약은 <span style="color:red">식후 30분</span>에 복용하세요.</div>';
    const result = stripForTts(html);
    expect(result).toBe('이 약은 식후 30분에 복용하세요.');
  });

  it('should remove emojis and maintain clean text', () => {
    const text = '오늘 처방받은 약입니다 💊🏥 꼭 챙겨 드세요 😊';
    const result = stripForTts(text);
    expect(result).toBe('오늘 처방받은 약입니다 꼭 챙겨 드세요');
  });

  it('should clean up bracket contents often found in drug names', () => {
    const text = '타이레놀(Acetaminophen) 500mg [비급여]';
    const result = stripForTts(text);
    // 현재 정규식: \s+ 정리 -> '타이레놀 500mg'
    expect(result).toBe('타이레놀 500mg');
  });

  it('should handle links and multi-line whitespace', () => {
    const text = '상세 정보는 [여기](https://pilly.com)를\n\n   참조하세요.';
    const result = stripForTts(text);
    expect(result).toBe('상세 정보는 여기를 참조하세요.');
  });
});
