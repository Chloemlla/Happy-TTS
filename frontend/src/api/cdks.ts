import { api } from './api';
import { Resource } from './resources';

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

export interface CDKsResponse {
  cdks: CDK[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CDKStats {
  total: number;
  used: number;
  available: number;
}

export interface RedeemResult {
  resource: Resource;
  cdk: CDK;
}

export const cdksApi = {
  // CDK兑换
  redeemCDK: async (code: string): Promise<RedeemResult> => {
    const response = await api.post('/api/redeem', { code });
    return response.data;
  },

  // 获取CDK列表
  getCDKs: async (page = 1, resourceId?: string): Promise<CDKsResponse> => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    if (resourceId) params.append('resourceId', resourceId);
    
    const response = await api.get(`/api/cdks?${params}`);
    return response.data;
  },

  // 获取CDK统计
  getCDKStats: async (): Promise<CDKStats> => {
    const response = await api.get('/api/cdks/stats');
    return response.data;
  },

  // 生成CDK
  generateCDKs: async (resourceId: string, count: number, expiresAt?: Date): Promise<CDK[]> => {
    const response = await api.post('/api/cdks/generate', {
      resourceId,
      count,
      expiresAt
    });
    return response.data;
  },

  // 删除CDK
  deleteCDK: async (id: string): Promise<void> => {
    await api.delete(`/api/cdks/${id}`);
  }
}; 