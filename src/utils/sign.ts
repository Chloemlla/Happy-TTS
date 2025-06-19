import crypto from 'crypto';

const SECRET_KEY = process.env.SIGN_SECRET_KEY || 'w=NKYzE?jZHbqmG1k4m6B!.Yp9t5)HY@LsMnN~UK9i';

export function signContent(content: string): string {
  return crypto.createHmac('sha256', SECRET_KEY).update(content).digest('hex');
}

export function verifyContent(content: string, signature: string): boolean {
  const expected = signContent(content);
  return expected === signature;
} 