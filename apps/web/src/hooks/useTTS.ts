import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/utils/logger';

/**
 * @description 텍스트에서 마크다운 링크 형식을 제거하고 텍스트 본문만 추출하는 헬퍼 함수입니다.
 * TTS 출력 시 URL이나 마크다운 문법이 그대로 읽히는 것을 방지합니다.
 *
 * @param {string} text - 변환할 원본 텍스트
 * @returns {string} 링크가 제거된 순수 텍스트
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
 * @description 텍스트에서 HTML 태그를 제거하는 헬퍼 함수입니다.
 * TTS 엔진이 태그 문자열을 읽지 않도록 정제합니다.
 *
 * @param {string} text - 태그가 포함된 텍스트
 * @returns {string} HTML 태그가 제거된 텍스트
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
 * @description 괄호( (), [] )와 그 내부 콘텐츠를 제거하는 헬퍼 함수입니다.
 * 약물 명칭 등에서 부가 정보를 생략하고 핵심 명칭 위주로 읽어주기 위해 사용됩니다.
 *
 * @param {string} text - 변환할 원본 텍스트
 * @returns {string} 괄호와 내용이 제거된 텍스트
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
 * @description 브라우저의 Web Speech API(SpeechSynthesis)를 활용하여 텍스트를 음성으로 변환하는 커스텀 훅입니다.
 * AI의 상담 내용을 사용자에게 읽어주는 시나리오에서 사용되며, 마크다운/HTML 정제 및 문장 분할 재생 로직을 포함합니다.
 *
 * @returns {Object} TTS 조작 함수 및 상태
 * @returns {Function} returns.speak - 텍스트 음성 출력 함수
 * @returns {Function} returns.stopSpeaking - 음성 중단 함수
 * @returns {boolean} returns.isSpeaking - 현재 음성 출력 중 여부
 * @returns {boolean} returns.ttsSupported - 브라우저의 TTS 지원 여부
 */
export const useTTS = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ttsSupported, setTtsSupported] = useState(false);
  const activeUtterances = useRef<SpeechSynthesisUtterance[]>([]);

  useEffect(() => {
    if (typeof globalThis !== 'undefined' && globalThis.speechSynthesis) {
      setTtsSupported(true);

      const loadVoices = () => {
        const availableVoices = globalThis.speechSynthesis.getVoices();
        setVoices(availableVoices);
      };

      loadVoices();
      globalThis.speechSynthesis.onvoiceschanged = loadVoices;

      return () => {
        globalThis.speechSynthesis.cancel();
        if (globalThis.speechSynthesis) {
          globalThis.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  /**
   * @description TTS 출력을 위해 텍스트를 정제합니다.
   * 마크다운 기호, HTML, 괄호 내용 및 이모지를 제거하여 자연스러운 음성 합성을 지원합니다.
   *
   * @param {string} text - 정제할 원본 텍스트
   * @returns {string} 정제된 순수 텍스트
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
      .replaceAll(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '')
      .replaceAll('\n', ' ')
      .replaceAll(/\s+/g, ' ')
      .trim();
  }, []);

  /**
   * @description 현재 재생 중인 모든 음성을 즉시 중단하고 상태를 초기화합니다.
   */
  const stopSpeaking = useCallback(() => {
    if (typeof globalThis !== 'undefined' && globalThis.speechSynthesis) {
      globalThis.speechSynthesis.cancel();
      activeUtterances.current.length = 0;
      setIsSpeaking(false);
    }
  }, []);

  /**
   * @description 전달된 텍스트를 정제한 후, 문장 단위로 나누어 음성으로 출력합니다.
   * 한국어(ko-KR) 음성을 우선적으로 선택하여 재생합니다.
   *
   * @param {string} text - 음성으로 출력할 원본 텍스트
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
        utterance.rate = 1;
        utterance.pitch = 1;

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
          logger.error({ err: event }, 'TTS Error:');
          setIsSpeaking(false);
        };

        globalThis.speechSynthesis.speak(utterance);
      });
    },
    [ttsSupported, voices, stopSpeaking, stripForTts],
  );

  return { speak, stopSpeaking, isSpeaking, ttsSupported };
};
