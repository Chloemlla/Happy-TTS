import { api, getApiBaseUrl } from './api';

export interface Resource {
  id: string;
  title: string;
  description: string;
  downloadUrl: string;
  price: number;
  category: string;
  imageUrl: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourcesResponse {
  resources: Resource[];
  total: number;
  page: number;
  pageSize: number;
}

export const resourcesApi = {
  // 获取资源列表
  getResources: async (page = 1, category?: string): Promise<ResourcesResponse> => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    if (category) params.append('category', category);
    
    const response = await api.get(`${getApiBaseUrl()}/api/resources?${params}`);
    return response.data;
  },

  // 获取资源详情
  getResource: async (id: string): Promise<Resource> => {
    const response = await api.get(`${getApiBaseUrl()}/api/resources/${id}`);
    return response.data;
  },

  // 获取分类列表
  getCategories: async (): Promise<string[]> => {
    const response = await api.get(`${getApiBaseUrl()}/api/categories`);
    return response.data;
  },

  // 获取资源统计
  getResourceStats: async () => {
    const response = await api.get(`${getApiBaseUrl()}/api/resources/stats`);
    return response.data;
  },

  // 创建资源
  createResource: async (resource: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>): Promise<Resource> => {
    const response = await api.post(`${getApiBaseUrl()}/api/resources`, resource);
    return response.data;
  },

  // 更新资源
  updateResource: async (id: string, resource: Partial<Resource>): Promise<Resource> => {
    const response = await api.put(`${getApiBaseUrl()}/api/resources/${id}`, resource);
    return response.data;
  },

  // 删除资源
  deleteResource: async (id: string): Promise<void> => {
    await api.delete(`${getApiBaseUrl()}/api/resources/${id}`);
  }
}; 