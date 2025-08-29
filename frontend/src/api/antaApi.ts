/**
 * 安踏防伪查询API服务
 * Anta Anti-Counterfeit API Service
 */

import { AxiosResponse } from 'axios';
import { api, apiWithRetry } from './api';
import {
  ProductInfo,
  QueryProductResponse,
  QueryStatsResponse,
  AntiCounterfeitError,
  AntiCounterfeitErrorType,
  createAntiCounterfeitError,
  validateProductId
} from '../types/anta';

// API端点常量
const ENDPOINTS = {
  QUERY_PRODUCT: '/api/anta/query',
  QUERY_STATS: '/api/anta/stats'
} as const;

// 请求配置
const REQUEST_CONFIG = {
  timeout: 10000, // 10秒超时
  headers: {
    'Content-Type': 'application/json'
  }
} as const;

/**
 * 查询产品信息
 * @param productId 产品ID
 * @returns Promise<ProductInfo>
 */
export async function queryProductInfo(productId: string): Promise<ProductInfo> {
  try {
    // 输入验证
    if (!validateProductId(productId)) {
      throw createAntiCounterfeitError(
        AntiCounterfeitErrorType.INVALID_PRODUCT_ID,
        '产品ID格式不正确'
      );
    }

    // 发送API请求
    const response: AxiosResponse<QueryProductResponse> = await apiWithRetry.get(
      `${ENDPOINTS.QUERY_PRODUCT}/${encodeURIComponent(productId.trim())}`,
      REQUEST_CONFIG
    );

    // 检查响应状态
    if (!response.data.success) {
      const errorMessage = response.data.error || '查询失败';
      
      // 根据错误消息判断错误类型
      if (errorMessage.includes('未找到') || errorMessage.includes('not found')) {
        throw createAntiCounterfeitError(
          AntiCounterfeitErrorType.PRODUCT_NOT_FOUND,
          errorMessage
        );
      } else if (errorMessage.includes('格式') || errorMessage.includes('invalid')) {
        throw createAntiCounterfeitError(
          AntiCounterfeitErrorType.INVALID_PRODUCT_ID,
          errorMessage
        );
      } else {
        throw createAntiCounterfeitError(
          AntiCounterfeitErrorType.SERVER_ERROR,
          errorMessage
        );
      }
    }

    // 验证返回数据
    if (!response.data.data) {
      throw createAntiCounterfeitError(
        AntiCounterfeitErrorType.SERVER_ERROR,
        '服务器返回数据为空'
      );
    }

    return response.data.data;

  } catch (error: any) {
    // 如果已经是AntiCounterfeitError，直接抛出
    if (error.type && Object.values(AntiCounterfeitErrorType).includes(error.type)) {
      throw error;
    }

    // 处理网络和HTTP错误
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      throw createAntiCounterfeitError(
        AntiCounterfeitErrorType.API_TIMEOUT,
        '请求超时，请稍后重试',
        error
      );
    }

    if (error.code === 'NETWORK_ERROR' || error.message === 'Network Error') {
      throw createAntiCounterfeitError(
        AntiCounterfeitErrorType.NETWORK_ERROR,
        '网络连接异常，请检查网络连接',
        error
      );
    }

    if (error.response?.status === 429) {
      throw createAntiCounterfeitError(
        AntiCounterfeitErrorType.RATE_LIMIT_EXCEEDED,
        '查询过于频繁，请稍后再试',
        error
      );
    }

    if (error.response?.status >= 500) {
      throw createAntiCounterfeitError(
        AntiCounterfeitErrorType.SERVER_ERROR,
        '服务器暂时不可用，请稍后重试',
        error
      );
    }

    // 其他未知错误
    throw createAntiCounterfeitError(
      AntiCounterfeitErrorType.SERVER_ERROR,
      error.message || '查询失败，请稍后重试',
      error
    );
  }
}

/**
 * 查询产品统计信息
 * @param productId 产品ID
 * @returns Promise<QueryStatsResponse['data']>
 */
export async function queryProductStats(productId: string): Promise<QueryStatsResponse['data']> {
  try {
    // 输入验证
    if (!validateProductId(productId)) {
      throw createAntiCounterfeitError(
        AntiCounterfeitErrorType.INVALID_PRODUCT_ID,
        '产品ID格式不正确'
      );
    }

    // 发送API请求
    const response: AxiosResponse<QueryStatsResponse> = await apiWithRetry.get(
      `${ENDPOINTS.QUERY_STATS}/${encodeURIComponent(productId.trim())}`,
      REQUEST_CONFIG
    );

    // 检查响应状态
    if (!response.data.success) {
      throw createAntiCounterfeitError(
        AntiCounterfeitErrorType.SERVER_ERROR,
        response.data.error || '获取统计信息失败'
      );
    }

    return response.data.data;

  } catch (error: any) {
    // 如果已经是AntiCounterfeitError，直接抛出
    if (error.type && Object.values(AntiCounterfeitErrorType).includes(error.type)) {
      throw error;
    }

    // 处理网络和HTTP错误
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      throw createAntiCounterfeitError(
        AntiCounterfeitErrorType.API_TIMEOUT,
        '请求超时，请稍后重试',
        error
      );
    }

    if (error.code === 'NETWORK_ERROR' || error.message === 'Network Error') {
      throw createAntiCounterfeitError(
        AntiCounterfeitErrorType.NETWORK_ERROR,
        '网络连接异常，请检查网络连接',
        error
      );
    }

    // 统计信息查询失败不应该影响主要功能，返回默认值
    console.warn('Failed to fetch product stats:', error);
    return {
      productId: productId.trim(),
      queryCount: 0,
      lastQueried: new Date().toISOString()
    };
  }
}

/**
 * 批量查询产品信息（预留接口）
 * @param productIds 产品ID数组
 * @returns Promise<ProductInfo[]>
 */
export async function queryMultipleProducts(productIds: string[]): Promise<ProductInfo[]> {
  // 验证输入
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw createAntiCounterfeitError(
      AntiCounterfeitErrorType.INVALID_PRODUCT_ID,
      '产品ID列表不能为空'
    );
  }

  // 验证每个产品ID
  const invalidIds = productIds.filter(id => !validateProductId(id));
  if (invalidIds.length > 0) {
    throw createAntiCounterfeitError(
      AntiCounterfeitErrorType.INVALID_PRODUCT_ID,
      `以下产品ID格式不正确: ${invalidIds.join(', ')}`
    );
  }

  // 目前使用串行查询，未来可以优化为并行或批量API
  const results: ProductInfo[] = [];
  const errors: { productId: string; error: AntiCounterfeitError }[] = [];

  for (const productId of productIds) {
    try {
      const result = await queryProductInfo(productId);
      results.push(result);
    } catch (error: any) {
      errors.push({ productId, error });
    }
  }

  // 如果所有查询都失败，抛出错误
  if (results.length === 0 && errors.length > 0) {
    throw errors[0].error;
  }

  return results;
}

/**
 * 检查API服务健康状态
 * @returns Promise<boolean>
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await api.get('/api/health', {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    return response.status === 200;
  } catch (error) {
    console.warn('API health check failed:', error);
    return false;
  }
}

// 导出API服务对象
export const antaApi = {
  queryProductInfo,
  queryProductStats,
  queryMultipleProducts,
  checkApiHealth
};

export default antaApi;