import { api, getApiBaseUrl } from './api';
import { Resource } from './resources';

export interface CDK {
  id: string;
  code: string;
  resourceId: string;
  isUsed: boolean;
  usedAt?: Date;
  usedIp?: string;
  usedBy?: {
    userId: string;
    username: string;
  };
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

export interface RedeemedResource {
  id: string;
  title: string;
  description: string;
  downloadUrl: string;
  price: number;
  category: string;
  imageUrl: string;
  redeemedAt: Date;
  cdkCode: string;
  redemptionCount: number;
}

export interface RedeemedResourcesResponse {
  resources: RedeemedResource[];
  total: number;
}

export const cdksApi = {
  // CDK兑换
  redeemCDK: async (code: string, userInfo?: { userId: string; username: string }, forceRedeem?: boolean) => {
    const response = await api.post(`${getApiBaseUrl()}/api/redeem`, { 
      code,
      ...(userInfo && { userId: userInfo.userId, username: userInfo.username }),
      ...(forceRedeem && { forceRedeem })
    });
    return response.data;
  },

  // 获取CDK列表
  getCDKs: async (page = 1, resourceId?: string): Promise<CDKsResponse> => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    if (resourceId) params.append('resourceId', resourceId);
    
    const response = await api.get(`${getApiBaseUrl()}/api/cdks?${params}`);
    return response.data;
  },

  // 获取CDK统计
  getCDKStats: async (): Promise<CDKStats> => {
    const response = await api.get(`${getApiBaseUrl()}/api/cdks/stats`);
    return response.data;
  },

  // 生成CDK
  generateCDKs: async (resourceId: string, count: number, expiresAt?: Date): Promise<CDK[]> => {
    const response = await api.post(`${getApiBaseUrl()}/api/cdks/generate`, {
      resourceId,
      count,
      expiresAt
    });
    return response.data;
  },

  // 更新CDK
  updateCDK: async (id: string, cdk: Partial<CDK>): Promise<CDK> => {
    const response = await api.put(`${getApiBaseUrl()}/api/cdks/${id}`, cdk);
    return response.data;
  },

  // 删除CDK
  deleteCDK: async (id: string): Promise<void> => {
    await api.delete(`${getApiBaseUrl()}/api/cdks/${id}`);
  },

  // 批量删除CDK
  batchDeleteCDKs: async (ids: string[]): Promise<{
    message: string;
    requestedCount: number;
    validCount: number;
    deletedCount: number;
    deletedCodes: string[];
  }> => {
    const response = await api.post(`${getApiBaseUrl()}/api/cdks/batch-delete`, { ids });
    return response.data;
  },

  // 获取CDK总数量
  getTotalCDKCount: async (): Promise<{
    totalCount: number;
  }> => {
    const response = await api.get(`${getApiBaseUrl()}/api/cdks/total-count`);
    return response.data;
  },

  // 删除所有CDK
  deleteAllCDKs: async (): Promise<{
    message: string;
    deletedCount: number;
  }> => {
    const response = await api.delete(`${getApiBaseUrl()}/api/cdks/all`);
    return response.data;
  },

  // 删除所有未使用的CDK
  deleteUnusedCDKs: async (): Promise<{
    message: string;
    deletedCount: number;
  }> => {
    const response = await api.delete(`${getApiBaseUrl()}/api/cdks/unused`);
    return response.data;
  },

  // 获取用户已兑换的资源
  getUserRedeemedResources: async (): Promise<RedeemedResourcesResponse> => {
    const response = await api.get(`${getApiBaseUrl()}/api/redeemed`);
    return response.data;
  }
}; 