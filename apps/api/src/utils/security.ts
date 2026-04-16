import * as jose from 'jose';
import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY is not defined in environment variables');
  }
  return Buffer.from(key, 'hex');
};

export const encrypt = (text: string): string => {
  if (!text) return text;
  const iv = crypto.randomBytes(12); // GCM 권장 IV 길이는 12바이트
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

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
    console.error('Decryption failed', err);
    return text; // 실패 시 원본 문자열 반환 (마이그레이션 대비)
  }
};

export const generateToken = async (payload: Record<string, unknown>) => {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return await new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(secret);
};

export const verifyToken = async (token: string) => {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jose.jwtVerify(token, secret);
  return payload;
};
