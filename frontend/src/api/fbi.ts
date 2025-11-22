/**
 * FBI通缉犯API统一管理
 * 提供类型安全的API调用方法
 */

import { FBIWanted, FBIStatistics, FBIApiResponse, FBIPaginationParams, FBIWantedInput } from '../types/fbi';
import getApiBaseUrl from './index';

const API_BASE = getApiBaseUrl();

/**
 * FBI通缉犯API类
 */
class FBIWantedAPI {
  /**
   * 通用请求方法
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<FBIApiResponse<T>> {
    const token = localStorage.getItem('token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '请求失败' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ===== 公开API（无需认证） =====

  /**
   * 获取公开通缉犯列表
   */
  async getPublicList(params: FBIPaginationParams = {}): Promise<FBIApiResponse<FBIWanted[]>> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        queryParams.append(key, String(value));
      }
    });

    const response = await fetch(`${API_BASE}/api/fbi-wanted/public/list?${queryParams}`, {
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`获取列表失败: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 获取公开通缉犯详情
   */
  async getPublicById(id: string): Promise<FBIApiResponse<FBIWanted>> {
    const response = await fetch(`${API_BASE}/api/fbi-wanted/public/${id}`, {
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`获取详情失败: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 获取公开统计信息
   */
  async getPublicStatistics(): Promise<FBIApiResponse<FBIStatistics>> {
    const response = await fetch(`${API_BASE}/api/fbi-wanted/public/statistics`, {
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`获取统计失败: ${response.status}`);
    }

    return response.json();
  }

  // ===== 管理员API（需要认证） =====

  /**
   * 获取通缉犯列表（管理员）
   */
  async getList(params: FBIPaginationParams = {}): Promise<FBIApiResponse<FBIWanted[]>> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        queryParams.append(key, String(value));
      }
    });

    return this.request(`/api/fbi-wanted?${queryParams}`);
  }

  /**
   * 获取通缉犯详情（管理员）
   */
  async getById(id: string): Promise<FBIApiResponse<FBIWanted>> {
    return this.request(`/api/fbi-wanted/${id}`);
  }

  /**
   * 创建通缉犯记录
   */
  async create(data: FBIWantedInput): Promise<FBIApiResponse<FBIWanted>> {
    return this.request('/api/fbi-wanted', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * 更新通缉犯记录
   */
  async update(id: string, data: FBIWantedInput): Promise<FBIApiResponse<FBIWanted>> {
    return this.request(`/api/fbi-wanted/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * 更新通缉犯状态
   */
  async updateStatus(id: string, status: string): Promise<FBIApiResponse<FBIWanted>> {
    return this.request(`/api/fbi-wanted/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  /**
   * 删除通缉犯记录
   */
  async delete(id: string): Promise<FBIApiResponse<void>> {
    return this.request(`/api/fbi-wanted/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * 批量删除通缉犯记录
   */
  async batchDelete(ids: string[]): Promise<FBIApiResponse<void>> {
    return this.request('/api/fbi-wanted/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  /**
   * 根据条件批量删除
   */
  async deleteMultiple(filter: any): Promise<FBIApiResponse<void>> {
    return this.request('/api/fbi-wanted/multiple', {
      method: 'DELETE',
      body: JSON.stringify({ filter }),
    });
  }

  /**
   * 上传通缉犯头像
   */
  async uploadPhoto(id: string, file: File): Promise<FBIApiResponse<FBIWanted>> {
    const formData = new FormData();
    formData.append('photo', file);

    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/api/fbi-wanted/${id}/photo`, {
      method: 'PATCH',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '上传失败' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * 获取统计信息（管理员）
   */
  async getStatistics(): Promise<FBIApiResponse<FBIStatistics>> {
    return this.request('/api/fbi-wanted/statistics');
  }
}

/**
 * 导出单例实例
 */
export const fbiAPI = new FBIWantedAPI();

/**
 * 默认导出
 */
export default fbiAPI;
