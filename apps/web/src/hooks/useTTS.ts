import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 텍스트에서 마크다운 링크 형식을 제거하고 텍스트 본문만 추출합니다.
 * @param text - 변환할 원본 텍스트
 * @returns 링크가 제거된 순수 텍스트
 */
const stripLinks = (text: string): string => {
  let result = text;
  while (result.includes('[') && result.includes('](') && result.includes(')')) {
    const start = result.indexOf('[');
    const mid = result.indexOf('](');
    const end = result.indexOf(')', mid);
    if (start < mid && mid < end) {
      const linkText = result.substring(start + 1, mid);
      result = result.substring(0, start) + linkText + result.substring(end + 1);
    } else {
      break;
    }
  }
  return result;
};

/**
 * 텍스트에서 HTML 태그를 제거합니다.
 * @param text - 태그가 포함된 텍스트
 * @returns HTML 태그가 제거된 텍스트
 */
const stripHtml = (text: string): string => {
  let result = text;
  while (result.includes('<') && result.includes('>')) {
    const start = result.indexOf('<');
    const end = result.indexOf('>', start);
    if (end > start) {
      result = result.substring(0, start) + result.substring(end + 1);
    } else {
      break;
    }
  }
  return result;
};

/**
 * 괄호 내용 제거 (약물 명칭 등에서 부가 정보를 제거하기 위함)
 */
const stripBrackets = (text: string): string => {
  let result = text;
  const bracketPairs = [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
  ];

  bracketPairs.forEach(({ open, close }) => {
    while (result.includes(open) && result.includes(close)) {
      const start = result.indexOf(open);
      const end = result.indexOf(close, start);
      if (end <= start) break;
      result = result.substring(0, start) + result.substring(end + 1);
    }
  });
  return result;
};

/**
 * 브라우저의 Web Speech API(SpeechSynthesis)를 활용한 TTS 커스텀 훅
 * 문장 분할 처리, 음성 중단 처리 및 텍스트 정제 로직을 포함합니다.
 *
 * @returns {speak, stopSpeaking, isSpeaking, ttsSupported} TTS 조작 함수 및 상태
 */
export const useTTS = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ttsSupported, setTtsSupported] = useState(false);
  const activeUtterances = useRef<SpeechSynthesisUtterance[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      setTtsSupported(true);

      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
      };

      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;

      return () => {
        window.speechSynthesis.cancel();
        if (window.speechSynthesis) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  /**
   * TTS 출력을 위해 텍스트를 정제합니다.
   * 마크다운 기호, HTML, 괄호 내용 및 이모지를 제거합니다.
   *
   * @param text - 정제할 텍스트
   * @returns 정제된 텍스트
   */
  const stripForTts = useCallback((text: string): string => {
    if (!text) return '';

    let result = stripLinks(text);
    result = stripHtml(result);
    result = stripBrackets(result);

    const markdownSymbols = ['**', '__', '*', '_', '#', '`', '~'];
    markdownSymbols.forEach((sym) => {
      result = result.split(sym).join('');
    });

    return result
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  /**
   * 현재 재생 중인 모든 음성을 중단합니다.
   */
  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      activeUtterances.current.length = 0;
      setIsSpeaking(false);
    }
  }, []);

  /**
   * 전달된 텍스트를 음성으로 출력합니다.
   *
   * @param text - 음성으로 출력할 텍스트
   */
  const speak = useCallback(
    (text: string) => {
      if (!ttsSupported || !text) return;

      stopSpeaking();

      const cleanText = stripForTts(text);
      if (!cleanText) return;

      const chunks = cleanText
        .split(/([.!?])/)
        .reduce((acc: string[], cur, i, arr) => {
          if (i % 2 === 0) {
            const punctuation = arr[i + 1] || '';
            acc.push(cur + punctuation);
          }
          return acc;
        }, [])
        .filter((c) => c.trim().length > 0);

      const koVoice = voices.find((v) => v.lang.startsWith('ko')) || voices[0];

      setIsSpeaking(true);
      let completedChunks = 0;

      chunks.forEach((chunk) => {
        const utterance = new SpeechSynthesisUtterance(chunk.trim());
        if (koVoice) utterance.voice = koVoice;
        utterance.lang = 'ko-KR';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        activeUtterances.current.push(utterance);

        utterance.onend = () => {
          const idx = activeUtterances.current.indexOf(utterance);
          if (idx > -1) activeUtterances.current.splice(idx, 1);

          completedChunks++;
          if (completedChunks >= chunks.length) {
            setIsSpeaking(false);
          }
        };

        utterance.onerror = (event) => {
          console.error('TTS Error:', event);
          setIsSpeaking(false);
        };

        window.speechSynthesis.speak(utterance);
      });
    },
    [ttsSupported, voices, stopSpeaking, stripForTts],
  );

  return { speak, stopSpeaking, isSpeaking, ttsSupported };
};
