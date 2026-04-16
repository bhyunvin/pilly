import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useTTS } from './useTTS';

/**
 * @description useTTS 커스텀 훅의 개별 기능(음성 출력, 중단, 초기 상태 등)을 검증하는 단위 테스트 스위트입니다.
 * 브라우저의 SpeechSynthesis API 모킹을 통해 훅의 동작을 테스트합니다.
 */
describe('useTTS Hook Unit Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('기본 상태가 올바르게 초기화되는가?', () => {
    const { result } = renderHook(() => useTTS());

    expect(result.current.isSpeaking).toBe(false);
    // vitest.setup.tsx에서 speechSynthesis를 모킹했으므로 true가 기대됨 (정의되어 있으므로)
    expect(result.current.ttsSupported).toBe(true);
  });

  it('speak 함수 호출 시 speechSynthesis.speak가 호출되는가?', () => {
    const { result } = renderHook(() => useTTS());

    act(() => {
      result.current.speak('안녕하세요');
    });

    // setup.tsx의 mock을 확인
    expect(globalThis.speechSynthesis.speak).toHaveBeenCalled();
  });

  it('stopSpeaking 호출 시 speechSynthesis.cancel이 호출되는가?', () => {
    const { result } = renderHook(() => useTTS());

    act(() => {
      result.current.stopSpeaking();
    });

    expect(globalThis.speechSynthesis.cancel).toHaveBeenCalled();
  });
});
