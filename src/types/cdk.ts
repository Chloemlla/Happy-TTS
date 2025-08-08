export interface CDK {
  id: string;
  code: string;
  resourceId: string;
  isUsed: boolean;
  usedAt?: Date;
  usedIp?: string;
  expiresAt?: Date;
  createdAt: Date;
} 