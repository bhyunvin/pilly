// 기존 로직을 packages/utils의 공용 함수로 대체합니다.
/**
 * TTS(Text-to-Speech) 변환을 위해 텍스트를 전처리하는 함수를 내보냅니다.
 *
 * @description
 * 텍스트에서 특수 문자나 불필요한 기호를 제거하여 음성 합성이 자연스럽게 이루어지도록 돕습니다.
 * 이 함수는 `packages/utils`에서 가져온 공용 함수입니다.
 *
 * @param {string} text - 전처리할 원본 텍스트
 * @returns {string} 특수 문자가 제거된 전처리된 텍스트
 */
export { stripForTts } from 'utils';
