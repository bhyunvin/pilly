/**
 * 마크다운 링크 처리: [텍스트](URL) -> 텍스트
 */
const stripLinks = (text: string): string => {
  let result = text;
  while (result.includes('[') && result.includes('](') && result.includes(')')) {
    const start = result.indexOf('[');
    const mid = result.indexOf('](');
    const end = result.indexOf(')', mid);
    if (start === -1 || mid === -1 || end === -1 || start >= mid || mid >= end) break;
    const linkText = result.substring(start + 1, mid);
    result = result.substring(0, start) + linkText + result.substring(end + 1);
  }
  return result;
};

/**
 * HTML 태그 제거
 */
const stripHtml = (text: string): string => {
  let result = text;
  while (result.includes('<') && result.includes('>')) {
    const start = result.indexOf('<');
    const end = result.indexOf('>', start);
    if (start === -1 || end === -1 || end <= start) break;
    result = result.substring(0, start) + result.substring(end + 1);
  }
  return result;
};

/**
 * 괄호 내용 제거 (Drug names 등에서 부가 정보를 제거하기 위함)
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
      if (start === -1 || end === -1 || end <= start) break;
      result = result.substring(0, start) + result.substring(end + 1);
    }
  });
  return result;
};

/**
 * TTS 엔진에 전달하기 전 텍스트를 정제하는 공용 유틸리티 함수
 * 마크다운 기호, HTML 태그, 이모지 등을 제거하여 발음이 꼬이지 않도록 함
 *
 * @param text - 정제할 원본 텍스트
 * @returns 발음에 최적화된 정제된 텍스트
 */
export const stripForTts = (text: string): string => {
  if (!text) return '';

  let result = stripLinks(text);
  result = stripHtml(result);
  result = stripBrackets(result);

  // 단순 마크다운 기호 및 특수 문자 제거
  const markdownSymbols = ['**', '__', '*', '_', '#', '`', '~'];
  markdownSymbols.forEach((sym) => {
    result = result.split(sym).join('');
  });

  return result
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '') // 이모지 제거
    .replace(/\n/g, ' ') // 줄바꿈을 공백으로
    .replace(/\s+/g, ' ') // 다중 공백 정리
    .trim();
};

/**
 * 공용 날짜 포맷터 (yyyy-MM-dd)
 */
export const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
};
