import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FaFingerprint, FaTrash, FaSync, FaInfoCircle, FaExclamationTriangle, 
  FaCheckCircle, FaTimesCircle, FaChartBar, FaClock, FaUsers, FaNetworkWired, FaCalendarAlt
} from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { turnstileApi, FingerprintStats } from '../api/turnstile';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import { useNotification } from './Notification';

export default function FingerprintManager() {
  const [stats, setStats] = useState<FingerprintStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const { setNotification } = useNotification();

  const fetchStats = async () => {
    try {
      const data = await turnstileApi.getFingerprintStats();
      setStats(data);
    } catch (error) {
      console.error('获取指纹统计失败:', error);
      setNotification({
        message: '获取指纹统计失败',
        type: 'error'
      });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
    setNotification({
      message: '指纹统计已刷新',
      type: 'success'
    });
  };

  const handleCleanup = async () => {
    if (window.confirm('确定要清理所有过期的指纹数据吗？此操作不可撤销。')) {
      setCleaning(true);
      try {
        const result = await turnstileApi.cleanupExpiredFingerprints();
        setNotification({
          message: `清理完成！删除了 ${result.cleanedCount} 个过期指纹`,
          type: 'success'
        });
        await fetchStats(); // 重新获取统计数据
      } catch (error: any) {
        console.error('清理过期指纹失败:', error);
        const msg = error?.response?.data?.error || '清理失败，请重试';
        setNotification({
          message: msg,
          type: 'error'
        });
      } finally {
        setCleaning(false);
      }
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchStats();
      setLoading(false);
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <UnifiedLoadingSpinner size="lg" text="加载指纹管理..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和说明 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-blue-700 flex items-center gap-2">
            <FaFingerprint className="w-5 h-5 sm:w-6 sm:h-6" />
            指纹管理
          </h2>
          <Link
            to="/admin"
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <FaInfoCircle className="w-4 h-4" />
            返回仪表板
          </Link>
        </div>
        <div className="text-gray-600 space-y-2">
          <p>此功能用于管理浏览器指纹数据，提供统计信息和过期数据清理功能。</p>
          <div className="flex items-start gap-2 text-sm">
            <FaInfoCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>实时查看指纹统计数据</li>
                <li>监控活跃指纹和过期指纹数量</li>
                <li>跟踪最近指纹上报情况</li>
                <li>清理过期指纹数据释放存储空间</li>
                <li>分析唯一IP地址分布</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 统计信息 */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        >
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <FaChartBar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
            指纹统计
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-lg p-4 shadow-sm border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-600 text-sm">总指纹数</span>
                <FaFingerprint className="w-5 h-5 text-blue-500" />
              </div>
              <div className="text-2xl font-bold text-gray-800 mt-1">{stats.total}</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-lg p-4 shadow-sm border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-600 text-sm">已验证</span>
                <FaCheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div className="text-2xl font-bold text-green-600 mt-1">{stats.verified}</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-lg p-4 shadow-sm border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-600 text-sm">未验证</span>
                <FaTimesCircle className="w-5 h-5 text-red-500" />
              </div>
              <div className="text-2xl font-bold text-red-600 mt-1">{stats.unverified}</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-lg p-4 shadow-sm border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-600 text-sm">过期指纹</span>
                <FaExclamationTriangle className="w-5 h-5 text-orange-500" />
              </div>
              <div className="text-2xl font-bold text-orange-600 mt-1">{stats.expired}</div>
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* 操作按钮 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="space-y-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaTrash className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
            数据管理
          </h3>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <motion.button
              onClick={handleCleanup}
              disabled={cleaning || (stats?.expired === 0)}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 transition-all duration-200 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: cleaning || (stats?.expired === 0) ? 1 : 1.02 }}
              whileTap={{ scale: cleaning || (stats?.expired === 0) ? 1 : 0.98 }}
            >
              {cleaning ? (
                <UnifiedLoadingSpinner size="sm" />
              ) : (
                <FaTrash className="w-4 h-4" />
              )}
              {cleaning ? '清理中...' : `清理过期指纹${stats?.expired && stats.expired > 0 ? ` (${stats.expired})` : ''}`}
            </motion.button>

            <motion.button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
              whileHover={{ scale: refreshing ? 1 : 1.02 }}
              whileTap={{ scale: refreshing ? 1 : 0.98 }}
            >
              <FaSync className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              刷新统计
            </motion.button>
          </div>

          {stats && stats.expired === 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3"
            >
              <FaCheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-green-800 font-medium">无需清理</p>
                <p className="text-green-600 text-sm">当前没有过期的指纹数据</p>
              </div>
            </motion.div>
          )}

          {stats && stats.expired > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-center gap-3"
            >
              <FaExclamationTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />
              <div>
                <p className="text-orange-800 font-medium">建议清理</p>
                <p className="text-orange-600 text-sm">
                  发现 {stats.expired} 个过期指纹，建议清理以释放存储空间
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* 说明信息 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-blue-50 rounded-xl p-6 border border-blue-100"
      >
        <div className="flex items-start gap-3">
          <FaInfoCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800 space-y-2">
            <p className="font-semibold">关于指纹管理：</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>指纹数据用于识别和跟踪用户设备，提高安全性</li>
              <li>过期指纹是指超过有效期限的指纹记录，不再用于验证</li>
              <li>定期清理过期数据可以优化存储性能</li>
              <li>活跃指纹数量反映了当前系统的用户活跃度</li>
              <li>唯一IP地址数量有助于分析用户分布情况</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
