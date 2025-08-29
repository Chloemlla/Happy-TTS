/**
 * 安踏防伪查询状态管理Hook
 * Anta Anti-Counterfeit State Management Hook
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ProductInfo,
  AntiCounterfeitError,
  AntiCounterfeitErrorType,
  createAntiCounterfeitError,
  getErrorMessage,
  validateProductId
} from '../types/anta';
import { antaApi } from '../api/antaApi';

// 缓存配置
const CACHE_CONFIG = {
  TTL: 5 * 60 * 1000, // 5分钟缓存
  MAX_SIZE: 50 // 最多缓存50个查询结果
} as const;

// 缓存项接口
interface CacheItem {
  data: ProductInfo;
  timestamp: number;
  expiresAt: number;
}

// Hook状态接口
interface UseAntiCounterfeitState {
  loading: boolean;
  error: AntiCounterfeitError | null;
  productInfo: ProductInfo | null;
  queryCount: number;
  lastProductId: string | null;
}

// Hook返回值接口
interface UseAntiCounterfeitReturn extends UseAntiCounterfeitState {
  queryProduct: (productId: string) => Promise<ProductInfo>;
  clearError: () => void;
  clearResult: () => void;
  retryLastQuery: () => Promise<ProductInfo | null>;
  isValidProductId: (productId: string) => boolean;
  getCachedResult: (productId: string) => ProductInfo | null;
  clearCache: () => void;
}

// 全局缓存存储
const cache = new Map<string, CacheItem>();

/**
 * 清理过期的缓存项
 */
function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (now > item.expiresAt) {
      cache.delete(key);
    }
  }
}

/**
 * 限制缓存大小
 */
function limitCacheSize(): void {
  if (cache.size > CACHE_CONFIG.MAX_SIZE) {
    // 删除最旧的缓存项
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toDelete = entries.slice(0, cache.size - CACHE_CONFIG.MAX_SIZE);
    toDelete.forEach(([key]) => cache.delete(key));
  }
}

/**
 * 获取缓存的查询结果
 */
function getCachedProductInfo(productId: string): ProductInfo | null {
  cleanExpiredCache();
  
  const cacheKey = productId.trim().toLowerCase();
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() <= cached.expiresAt) {
    return cached.data;
  }
  
  return null;
}

/**
 * 设置缓存
 */
function setCachedProductInfo(productId: string, data: ProductInfo): void {
  const now = Date.now();
  const cacheKey = productId.trim().toLowerCase();
  
  cache.set(cacheKey, {
    data,
    timestamp: now,
    expiresAt: now + CACHE_CONFIG.TTL
  });
  
  limitCacheSize();
}

/**
 * 安踏防伪查询Hook
 */
export function useAntiCounterfeit(): UseAntiCounterfeitReturn {
  // 状态管理
  const [state, setState] = useState<UseAntiCounterfeitState>({
    loading: false,
    error: null,
    productInfo: null,
    queryCount: 0,
    lastProductId: null
  });

  // 防重复提交的引用
  const currentRequestRef = useRef<AbortController | null>(null);
  const lastQueryTimeRef = useRef<number>(0);

  // 清理函数
  useEffect(() => {
    return () => {
      // 组件卸载时取消正在进行的请求
      if (currentRequestRef.current) {
        currentRequestRef.current.abort();
      }
    };
  }, []);

  /**
   * 清除错误状态
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  /**
   * 清除查询结果
   */
  const clearResult = useCallback(() => {
    setState(prev => ({
      ...prev,
      productInfo: null,
      queryCount: 0,
      error: null,
      lastProductId: null
    }));
  }, []);

  /**
   * 验证产品ID格式
   */
  const isValidProductId = useCallback((productId: string): boolean => {
    return validateProductId(productId);
  }, []);

  /**
   * 获取缓存的查询结果
   */
  const getCachedResult = useCallback((productId: string): ProductInfo | null => {
    return getCachedProductInfo(productId);
  }, []);

  /**
   * 清除所有缓存
   */
  const clearCache = useCallback(() => {
    cache.clear();
  }, []);

  /**
   * 查询产品信息
   */
  const queryProduct = useCallback(async (productId: string): Promise<ProductInfo> => {
    // 防重复提交检查
    const now = Date.now();
    if (now - lastQueryTimeRef.current < 1000) { // 1秒内不允许重复查询
      throw createAntiCounterfeitError(
        AntiCounterfeitErrorType.RATE_LIMIT_EXCEEDED,
        '查询过于频繁，请稍后再试'
      );
    }

    // 取消之前的请求
    if (currentRequestRef.current) {
      currentRequestRef.current.abort();
    }

    // 创建新的请求控制器
    const abortController = new AbortController();
    currentRequestRef.current = abortController;

    try {
      // 更新状态：开始加载
      setState(prev => ({
        ...prev,
        loading: true,
        error: null,
        lastProductId: productId.trim()
      }));

      lastQueryTimeRef.current = now;

      // 检查缓存
      const cachedResult = getCachedProductInfo(productId);
      if (cachedResult) {
        console.log('使用缓存的查询结果:', productId);
        
        setState(prev => ({
          ...prev,
          loading: false,
          productInfo: cachedResult,
          queryCount: cachedResult.queryCount
        }));

        return cachedResult;
      }

      // 调用API查询
      console.log('开始查询产品信息:', productId);
      const productInfo = await antaApi.queryProductInfo(productId);

      // 检查请求是否被取消
      if (abortController.signal.aborted) {
        throw createAntiCounterfeitError(
          AntiCounterfeitErrorType.NETWORK_ERROR,
          '请求已取消'
        );
      }

      // 尝试获取查询统计（不影响主要功能）
      let queryCount = productInfo.queryCount || 0;
      try {
        const stats = await antaApi.queryProductStats(productId);
        queryCount = stats.queryCount || queryCount;
      } catch (statsError) {
        console.warn('获取查询统计失败，使用默认值:', statsError);
      }

      // 更新产品信息中的查询次数
      const finalProductInfo: ProductInfo = {
        ...productInfo,
        queryCount
      };

      // 缓存结果
      setCachedProductInfo(productId, finalProductInfo);

      // 更新状态：查询成功
      setState(prev => ({
        ...prev,
        loading: false,
        productInfo: finalProductInfo,
        queryCount,
        error: null
      }));

      console.log('查询成功:', finalProductInfo);
      return finalProductInfo;

    } catch (error: any) {
      // 检查请求是否被取消
      if (abortController.signal.aborted) {
        return Promise.reject(createAntiCounterfeitError(
          AntiCounterfeitErrorType.NETWORK_ERROR,
          '请求已取消'
        ));
      }

      console.error('查询产品信息失败:', error);

      // 处理错误
      let antiCounterfeitError: AntiCounterfeitError;
      
      if (error.type && Object.values(AntiCounterfeitErrorType).includes(error.type)) {
        // 已经是AntiCounterfeitError
        antiCounterfeitError = error;
      } else {
        // 转换为AntiCounterfeitError
        antiCounterfeitError = createAntiCounterfeitError(
          AntiCounterfeitErrorType.SERVER_ERROR,
          error.message || '查询失败，请稍后重试',
          error
        );
      }

      // 更新状态：查询失败
      setState(prev => ({
        ...prev,
        loading: false,
        error: antiCounterfeitError,
        productInfo: null,
        queryCount: 0
      }));

      throw antiCounterfeitError;

    } finally {
      // 清理请求引用
      if (currentRequestRef.current === abortController) {
        currentRequestRef.current = null;
      }
    }
  }, []);

  /**
   * 重试上次查询
   */
  const retryLastQuery = useCallback(async (): Promise<ProductInfo | null> => {
    if (!state.lastProductId) {
      return null;
    }

    try {
      return await queryProduct(state.lastProductId);
    } catch (error) {
      console.error('重试查询失败:', error);
      throw error;
    }
  }, [state.lastProductId, queryProduct]);

  return {
    ...state,
    queryProduct,
    clearError,
    clearResult,
    retryLastQuery,
    isValidProductId,
    getCachedResult,
    clearCache
  };
}

/**
 * 获取用户友好的错误消息
 */
export function useErrorMessage(error: AntiCounterfeitError | null): string | null {
  if (!error) return null;
  return getErrorMessage(error);
}

/**
 * 检查是否有缓存的查询结果
 */
export function useHasCachedResult(productId: string): boolean {
  return getCachedProductInfo(productId) !== null;
}

export default useAntiCounterfeit;