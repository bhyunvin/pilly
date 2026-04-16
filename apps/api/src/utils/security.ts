import * as jose from 'jose';
import crypto from 'node:crypto';
import { logger } from './logger';

const ALGORITHM = 'aes-256-gcm';

/**
 * 환경 변수에서 암호화 키를 가져옵니다.
 * @returns 16진수 문자열에서 변환된 Buffer 형태의 암호화 키
 * @throws {Error} ENCRYPTION_KEY가 정의되지 않은 경우 에러를 발생시킵니다.
 */
const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY is not defined in environment variables');
  }
  return Buffer.from(key, 'hex');
};

/**
 * 주어진 텍스트를 AES-256-GCM 알고리즘으로 암호화합니다.
 *
 * @description
 * 보안을 위해 매 암호화마다 무작위 IV(Initialization Vector)를 생성하며,
 * 결과값은 'IV:AuthTag:EncryptedText' 형식의 문자열로 반환됩니다.
 *
 * @param text - 암호화할 원문 텍스트
 * @returns 암호화된 문자열
 */
export const encrypt = (text: string): string => {
  if (!text) return text;
  const iv = crypto.randomBytes(12); // GCM 권장 IV 길이는 12바이트
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * AES-256-GCM 알고리즘으로 암호화된 문자열을 복호화합니다.
 *
 * @description
 * 입력받은 문자열을 IV, AuthTag, 암호문으로 분리하여 복호화를 수행합니다.
 * 복호화 실패 시 로그를 남기고 원본 문자열을 반환합니다.
 *
 * @param text - 복호화할 암호화된 문자열 (포맷: IV:AuthTag:EncryptedText)
 * @returns 복호화된 원문 텍스트
 */
export const decrypt = (text: string): string => {
  if (!text) return text;
  const textParts = text.split(':');
  if (textParts.length !== 3) return text; // 지원되지 않는 포맷

  const iv = Buffer.from(textParts[0], 'hex');
  const authTag = Buffer.from(textParts[1], 'hex');
  const encryptedText = textParts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  try {
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    logger.error({ err }, 'Decryption failed');
    return text; // 실패 시 원본 문자열 반환 (마이그레이션 대비)
  }
};

/**
 * 주어진 페이로드를 담은 JWT 토큰을 생성합니다.
 *
 * @description
 * HS256 알고리즘을 사용하여 서명하며, 만료 시간은 2시간으로 설정됩니다.
 *
 * @async
 * @param payload - 토큰에 포함할 데이터
 * @returns 생성된 JWT 토큰 문자열
 */
export const generateToken = async (payload: Record<string, unknown>) => {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return await new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(secret);
};

/**
 * JWT 토큰의 유효성을 검증하고 페이로드를 반환합니다.
 *
 * @async
 * @param token - 검증할 JWT 토큰
 * @returns 검증된 토큰의 페이로드
 * @throws {Error} 토큰이 유효하지 않은 경우 에러를 발생시킵니다.
 */
export const verifyToken = async (token: string) => {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jose.jwtVerify(token, secret);
  return payload;
};
