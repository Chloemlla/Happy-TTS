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

// 导入结果类型
export interface ImportCDKResult {
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
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
  },

  // 导入CDK
  importCDKs: async (content: string): Promise<ImportCDKResult> => {
    const response = await api.post(`${getApiBaseUrl()}/api/cdks/import`, { content });
    return response.data;
  },

  // 导出CDK
  exportCDKs: async (resourceId?: string, filterType: 'all' | 'unused' | 'used' = 'all'): Promise<void> => {
    const params = new URLSearchParams();
    if (resourceId) params.append('resourceId', resourceId);
    if (filterType) params.append('filterType', filterType);
    
    const response = await api.get(`${getApiBaseUrl()}/api/cdks/export?${params}`, {
      responseType: 'blob'
    });
    
    // 从响应头获取文件名
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'cdks_export.txt';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/i);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }
    
    // 创建下载链接
    const blob = new Blob([response.data], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}; 