import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { stripForTts } from 'utils';
import { logger } from '@/utils/logger';

interface UseTTSReturn {
  /** 텍스트 음성 출력 함수 */
  speak: (text: string) => void;
  /** 음성 중단 함수 */
  stopSpeaking: () => void;
  /** 현재 음성 출력 중 여부 */
  isSpeaking: boolean;
  /** 브라우저의 TTS 지원 여부 */
  ttsSupported: boolean;
}

/**
 * @description 브라우저의 Web Speech API(SpeechSynthesis)를 활용하여 텍스트를 음성으로 변환하는 커스텀 훅입니다.
 * AI의 상담 내용을 사용자에게 읽어주는 시나리오에서 사용되며, 공용 `utils`의 `stripForTts`로 텍스트를 정제합니다.
 *
 * @returns TTS 조작 함수 및 상태
 */
export const useTTS = (): UseTTSReturn => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const ttsSupported = useSyncExternalStore(
    () => () => {},
    () => typeof globalThis !== 'undefined' && Boolean(globalThis.speechSynthesis),
    () => false,
  );
  const activeUtterances = useRef<SpeechSynthesisUtterance[]>([]);

  useEffect(() => {
    if (typeof globalThis !== 'undefined' && globalThis.speechSynthesis) {
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
   * @description 현재 재생 중인 모든 음성을 즉시 중단하고 상태를 초기화합니다.
   */
  const stopSpeaking = useCallback((): void => {
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
   * @param text - 음성으로 출력할 원본 텍스트
   */
  const speak = useCallback(
    (text: string): void => {
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
    [ttsSupported, voices, stopSpeaking],
  );

  return { speak, stopSpeaking, isSpeaking, ttsSupported };
};
