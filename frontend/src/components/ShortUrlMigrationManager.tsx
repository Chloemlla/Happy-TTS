import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaSync, FaChartBar, FaExclamationTriangle, FaCheckCircle, FaInfoCircle } from 'react-icons/fa';
import { useNotification } from './Notification';
import { useAuth } from '../hooks/useAuth';
import { getApiBaseUrl } from '../api/api';

interface MigrationStats {
  totalRecords: number;
  oldDomainRecords: number;
  newDomainRecords: number;
  otherDomainRecords: number;
  otherDomains?: Array<{
    domain: string;
    count: number;
  }>;
}

interface MigrationResult {
  totalChecked: number;
  totalFixed: number;
  fixedUrls: Array<{
    code: string;
    oldTarget: string;
    newTarget: string;
  }>;
}

const ShortUrlMigrationManager: React.FC = () => {
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [showOtherDomains, setShowOtherDomains] = useState(false);

  // 获取迁移统计信息
  const fetchStats = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiBaseUrl()}/api/admin/shortlinks/migration-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('获取统计信息失败');
      }

      const result = await response.json();
      setStats(result.data);
      setNotification({ message: '统计信息已更新', type: 'success' });
    } catch (error: any) {
      console.error('获取统计信息失败:', error);
      setNotification({ message: error.message || '获取统计信息失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 执行迁移
  const executeMigration = async () => {
    if (!window.confirm('确定要执行短链迁移吗？这将把所有的 ipfs.crossbell.io 域名替换为 ipfs.hapxs.com')) {
      return;
    }

    try {
      setMigrating(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiBaseUrl()}/api/admin/shortlinks/migrate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('迁移失败');
      }

      const result = await response.json();
      setMigrationResult(result.data);
      setNotification({ message: result.message || '迁移完成', type: 'success' });
      
      // 迁移完成后刷新统计信息
      await fetchStats();
    } catch (error: any) {
      console.error('迁移失败:', error);
      setNotification({ message: error.message || '迁移失败', type: 'error' });
    } finally {
      setMigrating(false);
    }
  };

  // 组件加载时获取统计信息
  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* 标题和说明 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
        <h2 className="text-2xl font-bold text-blue-700 mb-3 flex items-center gap-2">
          <FaSync className="w-6 h-6" />
          短链域名迁移管理
        </h2>
        <div className="text-gray-600 space-y-2">
          <p>此功能用于将短链数据库中的旧域名 <code className="bg-gray-200 px-1 rounded">ipfs.crossbell.io</code> 自动替换为新域名 <code className="bg-gray-200 px-1 rounded">ipfs.hapxs.com</code></p>
          <div className="flex items-start gap-2 text-sm">
            <FaInfoCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>启动时自动检测并修正现有短链</li>
                <li>新增短链时自动修正目标URL</li>
                <li>支持手动触发批量迁移</li>
                <li>提供详细的迁移统计信息</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 统计信息卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaChartBar className="w-5 h-5 text-green-500" />
            迁移统计信息
          </h3>
          <motion.button
            onClick={fetchStats}
            disabled={loading}
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
            whileTap={{ scale: 0.95 }}
          >
            <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </motion.button>
        </div>

        {stats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{stats.totalRecords}</div>
                <div className="text-sm text-gray-600">总记录数</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-red-700">{stats.oldDomainRecords}</div>
                <div className="text-sm text-gray-600">旧域名记录</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{stats.newDomainRecords}</div>
                <div className="text-sm text-gray-600">新域名记录</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-700">{stats.otherDomainRecords}</div>
                <div className="text-sm text-gray-600">其他域名记录</div>
              </div>
            </div>

            {/* 其他域名详细信息 */}
            {stats.otherDomains && stats.otherDomains.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-700">其他域名详情</h4>
                  <button
                    onClick={() => setShowOtherDomains(!showOtherDomains)}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
                  >
                    {showOtherDomains ? '收起' : '展开'}
                    <svg 
                      className={`w-4 h-4 transition-transform ${showOtherDomains ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                
                {showOtherDomains && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    <div className="text-sm text-gray-600 mb-2">
                      发现 {stats.otherDomains.length} 个不同的其他域名：
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {stats.otherDomains.map((domainInfo, index) => (
                        <div key={index} className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800 truncate" title={domainInfo.domain}>
                                {domainInfo.domain}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {domainInfo.count} 条记录
                              </div>
                            </div>
                            <div className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                              {((domainInfo.count / stats.totalRecords) * 100).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            {loading ? '加载中...' : '暂无统计信息'}
          </div>
        )}
      </motion.div>

      {/* 迁移操作卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FaExclamationTriangle className="w-5 h-5 text-orange-500" />
          迁移操作
        </h3>

        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <FaExclamationTriangle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-orange-800">
                <p className="font-semibold mb-1">⚠️ 注意事项：</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>迁移操作不可逆，请谨慎执行</li>
                  <li>建议在执行前备份数据库</li>
                  <li>迁移过程中请勿关闭服务器</li>
                  <li>大量数据迁移可能需要较长时间</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <motion.button
              onClick={executeMigration}
              disabled={migrating || (stats?.oldDomainRecords === 0)}
              className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 font-medium flex items-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <FaSync className={`w-4 h-4 ${migrating ? 'animate-spin' : ''}`} />
              {migrating ? '迁移中...' : '执行迁移'}
            </motion.button>

            {stats?.oldDomainRecords === 0 && (
              <div className="flex items-center gap-2 text-green-600">
                <FaCheckCircle className="w-5 h-5" />
                <span className="text-sm">无需迁移，所有短链已使用新域名</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* 迁移结果 */}
      <AnimatePresence>
        {migrationResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-xl p-6 shadow-sm border border-green-200"
          >
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FaCheckCircle className="w-5 h-5 text-green-500" />
              迁移结果
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-700">{migrationResult.totalChecked}</div>
                  <div className="text-sm text-gray-600">检查记录数</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-700">{migrationResult.totalFixed}</div>
                  <div className="text-sm text-gray-600">修正记录数</div>
                </div>
              </div>

              {migrationResult.fixedUrls.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">修正详情：</h4>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {migrationResult.fixedUrls.map((item, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-3 text-sm">
                        <div className="font-medium text-gray-800">短链码: {item.code}</div>
                        <div className="text-gray-600 mt-1">
                          <div className="line-through text-red-600">{item.oldTarget}</div>
                          <div className="text-green-600">→ {item.newTarget}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShortUrlMigrationManager; 