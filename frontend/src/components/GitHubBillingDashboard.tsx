import React, { useState, useEffect, useCallback } from 'react';
import { motion as m } from 'framer-motion';
import { FaSync, FaGithub, FaDollarSign, FaCalendarAlt, FaUser, FaTrash } from 'react-icons/fa';
import { useNotification } from './Notification';

// 动画配置
const ENTER_INITIAL = { opacity: 0, y: 20 };
const ENTER_ANIMATE = { opacity: 1, y: 0 };
const trans06 = { duration: 0.6 };

interface BillingUsageData {
  billableAmount: number;
  customerId?: string;
  [key: string]: any;
}

interface CachedCustomer {
  customerId: string;
  lastFetched: string;
  billableAmount: number;
}

const GitHubBillingDashboard: React.FC = () => {
  const { setNotification } = useNotification();
  const [billingData, setBillingData] = useState<BillingUsageData | null>(null);
  const [cachedCustomers, setCachedCustomers] = useState<CachedCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  // 获取认证头
  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // 格式化金额显示（保留两位小数）
  const formatAmount = (amount: number): string => {
    return amount.toFixed(2);
  };

  // 获取缓存的客户列表
  const fetchCachedCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const res = await fetch('/api/github-billing/customers', {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok) {
        setNotification({ message: data.error || '获取客户列表失败', type: 'error' });
        return;
      }
      if (data.success) {
        setCachedCustomers(data.data || []);
      }
    } catch (e) {
      setNotification({ message: '获取客户列表失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setCustomersLoading(false);
    }
  }, [setNotification]);

  // 获取账单数据
  const fetchBillingData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/github-billing/usage', {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok) {
        setNotification({ message: data.error || '获取账单数据失败', type: 'error' });
        return;
      }
      if (data.success) {
        setBillingData(data.data);
        setNotification({ message: '账单数据获取成功', type: 'success' });
        // 刷新客户列表
        await fetchCachedCustomers();
      }
    } catch (e) {
      setNotification({ message: '获取账单数据失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setNotification, fetchCachedCustomers]);

  // 清除缓存
  const clearCache = useCallback(async (customerId?: string) => {
    setClearingCache(true);
    try {
      const url = customerId 
        ? `/api/github-billing/cache/${customerId}`
        : '/api/github-billing/cache/expired';
      
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!res.ok) {
        setNotification({ message: data.error || '清除缓存失败', type: 'error' });
        return;
      }
      if (data.success) {
        setNotification({ message: '缓存清除成功', type: 'success' });
        // 刷新客户列表
        await fetchCachedCustomers();
        // 如果清除的是当前显示的数据，则清空显示
        if (customerId && billingData?.customerId === customerId) {
          setBillingData(null);
        }
      }
    } catch (e) {
      setNotification({ message: '清除缓存失败：' + (e instanceof Error ? e.message : '未知错误'), type: 'error' });
    } finally {
      setClearingCache(false);
    }
  }, [setNotification, fetchCachedCustomers, billingData]);

  // 组件加载时获取客户列表
  useEffect(() => {
    fetchCachedCustomers();
  }, [fetchCachedCustomers]);

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <m.div
        className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white"
        initial={ENTER_INITIAL}
        animate={ENTER_ANIMATE}
        transition={trans06}
      >
        <div className="flex items-center gap-3">
          <FaGithub className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">GitHub Billing Dashboard</h1>
            <p className="text-blue-100 mt-1">查看 GitHub 账单使用情况数据</p>
          </div>
        </div>
      </m.div>

      {/* 操作面板 */}
      <m.div
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={ENTER_INITIAL}
        animate={ENTER_ANIMATE}
        transition={trans06}
      >
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          <div className="flex gap-2">
            <m.button
              onClick={() => fetchBillingData()}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? '获取中...' : '获取数据'}
            </m.button>
            <m.button
              onClick={() => clearCache()}
              disabled={clearingCache}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaTrash className="w-4 h-4" />
              {clearingCache ? '清除中...' : '清除过期缓存'}
            </m.button>
          </div>
        </div>
      </m.div>

      {/* 账单数据显示 */}
      {billingData && (
        <m.div
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          initial={ENTER_INITIAL}
          animate={ENTER_ANIMATE}
          transition={trans06}
        >
          <div className="flex items-center gap-2 mb-4">
            <FaDollarSign className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-800">当前账单数据</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 可计费金额 */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <FaDollarSign className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">可计费金额</span>
              </div>
              <div className="text-2xl font-bold text-green-900">
                ${formatAmount(billingData.billableAmount)}
              </div>
              <div className="text-xs text-green-700 mt-1">
                原始值: {billingData.billableAmount}
              </div>
            </div>

            {/* Customer ID */}
            {billingData.customerId && (
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <FaUser className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Customer ID</span>
                </div>
                <div className="text-lg font-mono text-blue-900 break-all">
                  {billingData.customerId}
                </div>
              </div>
            )}

            {/* 获取时间 */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <FaCalendarAlt className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">获取时间</span>
              </div>
              <div className="text-sm text-purple-900">
                {new Date().toLocaleString()}
              </div>
            </div>
          </div>

          {/* 其他数据字段 */}
          {Object.keys(billingData).filter(key => !['billableAmount', 'customerId'].includes(key)).length > 0 && (
            <div className="mt-6">
              <h4 className="text-md font-semibold text-gray-700 mb-3">其他数据</h4>
              <div className="bg-gray-50 p-4 rounded-lg">
                <pre className="text-xs text-gray-700 overflow-x-auto">
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(billingData).filter(([key]) => !['billableAmount', 'customerId'].includes(key))
                    ),
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}
        </m.div>
      )}

      {/* 缓存的客户列表 */}
      {cachedCustomers.length > 0 && (
        <m.div
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          initial={ENTER_INITIAL}
          animate={ENTER_ANIMATE}
          transition={trans06}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">缓存的客户数据</h3>
            <m.button
              onClick={fetchCachedCustomers}
              disabled={customersLoading}
              className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition disabled:opacity-50 text-sm flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className={`w-3 h-3 ${customersLoading ? 'animate-spin' : ''}`} />
              刷新
            </m.button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Customer ID</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">可计费金额</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">缓存时间</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {cachedCustomers.map((customer, index) => (
                  <tr key={customer.customerId} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="py-2 px-3 font-mono text-xs break-all">{customer.customerId}</td>
                    <td className="py-2 px-3 font-bold text-green-600">
                      ${formatAmount(customer.billableAmount)}
                      <div className="text-xs text-gray-500">原始: {customer.billableAmount}</div>
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-600">
                      {new Date(customer.lastFetched).toLocaleString()}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex gap-1">
                        <m.button
                          onClick={() => fetchBillingData()}
                          className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 transition"
                          whileTap={{ scale: 0.95 }}
                        >
                          查看
                        </m.button>
                        <m.button
                          onClick={() => clearCache(customer.customerId)}
                          disabled={clearingCache}
                          className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition disabled:opacity-50"
                          whileTap={{ scale: 0.95 }}
                        >
                          清除
                        </m.button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </m.div>
      )}

      {/* 使用说明 */}
      <m.div
        className="bg-blue-50 rounded-xl p-6 border border-blue-200"
        initial={ENTER_INITIAL}
        animate={ENTER_ANIMATE}
        transition={trans06}
      >
        <h3 className="text-lg font-semibold text-blue-800 mb-3">使用说明</h3>
        <ul className="text-sm text-blue-700 space-y-2">
          <li>• <strong>获取数据：</strong>点击"获取数据"按钮从 GitHub API 获取最新的账单数据</li>
          <li>• <strong>Customer ID：</strong>可以指定特定的 Customer ID，留空则使用配置中的默认值</li>
          <li>• <strong>数据缓存：</strong>系统会自动缓存获取的数据，避免频繁调用 GitHub API</li>
          <li>• <strong>金额显示：</strong>billableAmount 会自动格式化为两位小数，同时显示原始值</li>
          <li>• <strong>缓存管理：</strong>可以清除特定客户的缓存或清除所有过期缓存</li>
        </ul>
      </m.div>
    </div>
  );
};

export default GitHubBillingDashboard;
