/**
 * JWT 工具 - 使用 jose 库 (Edge 兼容)
 * 替代 jsonwebtoken (Node.js only)
 */
import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from '../types';

function getSecret(jwtSecret: string): Uint8Array {
  return new TextEncoder().encode(jwtSecret);
}

export async function signToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  jwtSecret: string,
  expiresIn = '24h'
): Promise<string> {
  const secret = getSecret(jwtSecret);
  return new SignJWT(payload as Record<string, any>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyToken(token: string, jwtSecret: string): Promise<JWTPayload> {
  const secret = getSecret(jwtSecret);
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as JWTPayload;
}
