import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FaCog, FaPlay, FaStop, FaSync, FaInfoCircle, FaExclamationTriangle, 
  FaCheckCircle, FaChartBar, FaClock, FaDatabase, FaExchangeAlt, FaCalendarAlt,
  FaTrash, FaRunning, FaPauseCircle
} from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { turnstileApi, SchedulerStatus, SyncStatus } from '../api/turnstile';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import { useNotification } from './Notification';

export default function SystemManager() {
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { setNotification } = useNotification();

  const fetchSchedulerStatus = async () => {
    try {
      const data = await turnstileApi.getSchedulerStatus();
      setSchedulerStatus(data);
    } catch (error) {
      console.error('获取调度器状态失败:', error);
      setNotification({
        message: '获取调度器状态失败',
        type: 'error'
      });
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const data = await turnstileApi.getSyncStatus();
      setSyncStatus(data);
    } catch (error) {
      console.error('获取同步状态失败:', error);
      setNotification({
        message: '获取同步状态失败',
        type: 'error'
      });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchSchedulerStatus(), fetchSyncStatus()]);
    setRefreshing(false);
    setNotification({
      message: '系统状态已刷新',
      type: 'success'
    });
  };

  const handleStartScheduler = async () => {
    setStarting(true);
    try {
      const result = await turnstileApi.startScheduler();
      setNotification({
        message: result.message,
        type: 'success'
      });
      await fetchSchedulerStatus();
    } catch (error: any) {
      console.error('启动调度器失败:', error);
      const msg = error?.response?.data?.error || '启动调度器失败';
      setNotification({
        message: msg,
        type: 'error'
      });
    } finally {
      setStarting(false);
    }
  };

  const handleStopScheduler = async () => {
    if (window.confirm('确定要停止调度器吗？这将暂停所有定时任务。')) {
      setStopping(true);
      try {
        const result = await turnstileApi.stopScheduler();
        setNotification({
          message: result.message,
          type: 'success'
        });
        await fetchSchedulerStatus();
      } catch (error: any) {
        console.error('停止调度器失败:', error);
        const msg = error?.response?.data?.error || '停止调度器失败';
        setNotification({
          message: msg,
          type: 'error'
        });
      } finally {
        setStopping(false);
      }
    }
  };

  const handleManualCleanup = async () => {
    if (window.confirm('确定要执行手动清理吗？此操作将清理所有过期数据。')) {
      setCleaning(true);
      try {
        const result = await turnstileApi.manualCleanup();
        setNotification({
          message: `清理完成！处理了 ${result.cleanedCount} 条记录`,
          type: 'success'
        });
        await fetchSchedulerStatus();
      } catch (error: any) {
        console.error('手动清理失败:', error);
        const msg = error?.response?.data?.error || '手动清理失败';
        setNotification({
          message: msg,
          type: 'error'
        });
      } finally {
        setCleaning(false);
      }
    }
  };

  const handleSyncIPBans = async () => {
    setSyncing(true);
    try {
      const result = await turnstileApi.syncIPBans();
      setNotification({
        message: `同步完成！MongoDB→Redis: ${result.mongoToRedis}, Redis→MongoDB: ${result.redisToMongo}`,
        type: 'success'
      });
      await Promise.all([fetchSchedulerStatus(), fetchSyncStatus()]);
    } catch (error: any) {
      console.error('同步IP封禁失败:', error);
      const msg = error?.response?.data?.error || '同步IP封禁失败';
      setNotification({
        message: msg,
        type: 'error'
      });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchSchedulerStatus(), fetchSyncStatus()]);
      setLoading(false);
    };
    loadData();

    // 设置自动轮询，每30秒刷新一次状态
    const interval = setInterval(async () => {
      try {
        await Promise.all([fetchSchedulerStatus(), fetchSyncStatus()]);
      } catch (error) {
        console.error('自动刷新状态失败:', error);
      }
    }, 30000); // 30秒

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <UnifiedLoadingSpinner size="lg" text="加载系统管理..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和说明 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-green-50 to-teal-50 rounded-xl p-4 sm:p-6 border border-green-100"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-green-700 flex items-center gap-2">
            <FaCog className="w-5 h-5 sm:w-6 sm:h-6" />
            系统管理
          </h2>
          <Link
            to="/admin"
            className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm font-medium flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <FaInfoCircle className="w-4 h-4" />
            返回仪表板
          </Link>
        </div>
        <div className="text-gray-600 space-y-2">
          <p>此功能用于管理系统调度器和数据同步，提供定时任务控制和数据一致性保障。</p>
          <div className="flex items-start gap-2 text-sm">
            <FaInfoCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>控制调度器的启动和停止</li>
                <li>监控定时任务执行状态</li>
                <li>手动触发数据清理操作</li>
                <li>管理Redis和MongoDB数据同步</li>
                <li>查看系统运行统计信息</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 调度器状态 */}
      {schedulerStatus && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200"
        >
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <FaRunning className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
            调度器状态
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
            <div className={`${schedulerStatus.isRunning ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} rounded-lg p-3 sm:p-4 border`}>
              <div className="flex items-center justify-between gap-2">
                {schedulerStatus.isRunning ? (
                  <FaPlay className="w-6 h-6 sm:w-8 sm:h-8 text-green-500 flex-shrink-0" />
                ) : (
                  <FaPauseCircle className="w-6 h-6 sm:w-8 sm:h-8 text-red-500 flex-shrink-0" />
                )}
                <span className={`text-lg sm:text-2xl font-bold ${schedulerStatus.isRunning ? 'text-green-700' : 'text-red-700'}`}>
                  {schedulerStatus.isRunning ? '运行中' : '已停止'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-2">运行状态</p>
            </div>
            
            <div className="bg-blue-50 rounded-lg p-3 sm:p-4 border border-blue-200">
              <div className="flex items-center justify-between gap-2">
                <FaChartBar className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500 flex-shrink-0" />
                <span className="text-lg sm:text-2xl font-bold text-blue-700">{schedulerStatus.totalCleanups}</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-2">总清理次数</p>
            </div>
            
            <div className="bg-orange-50 rounded-lg p-3 sm:p-4 border border-orange-200">
              <div className="flex items-center justify-between gap-2">
                <FaExclamationTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-orange-500 flex-shrink-0" />
                <span className="text-lg sm:text-2xl font-bold text-orange-700">{schedulerStatus.errors}</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-2">错误次数</p>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-3 sm:p-4 border border-purple-200">
              <div className="flex items-center justify-between gap-2">
                <FaClock className="w-6 h-6 sm:w-8 sm:h-8 text-purple-500 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-purple-700">
                  {schedulerStatus.lastCleanup ? new Date(schedulerStatus.lastCleanup).toLocaleString('zh-CN') : '从未'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-2">上次清理</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <motion.button
              onClick={handleStartScheduler}
              disabled={starting || schedulerStatus.isRunning}
              className="flex-1 px-3 sm:px-4 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-lg hover:from-green-600 hover:to-teal-700 transition-all duration-200 font-medium text-sm sm:text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: starting || schedulerStatus.isRunning ? 1 : 1.02 }}
              whileTap={{ scale: starting || schedulerStatus.isRunning ? 1 : 0.98 }}
            >
              {starting ? (
                <UnifiedLoadingSpinner size="sm" />
              ) : (
                <FaPlay className="w-4 h-4" />
              )}
              {starting ? '启动中...' : '启动调度器'}
            </motion.button>

            <motion.button
              onClick={handleStopScheduler}
              disabled={stopping || !schedulerStatus.isRunning}
              className="flex-1 px-3 sm:px-4 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 transition-all duration-200 font-medium text-sm sm:text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: stopping || !schedulerStatus.isRunning ? 1 : 1.02 }}
              whileTap={{ scale: stopping || !schedulerStatus.isRunning ? 1 : 0.98 }}
            >
              {stopping ? (
                <UnifiedLoadingSpinner size="sm" />
              ) : (
                <FaStop className="w-4 h-4" />
              )}
              {stopping ? '停止中...' : '停止调度器'}
            </motion.button>

            <motion.button
              onClick={handleManualCleanup}
              disabled={cleaning}
              className="flex-1 px-3 sm:px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 font-medium text-sm sm:text-base flex items-center justify-center gap-2 disabled:opacity-50"
              whileHover={{ scale: cleaning ? 1 : 1.02 }}
              whileTap={{ scale: cleaning ? 1 : 0.98 }}
            >
              {cleaning ? (
                <UnifiedLoadingSpinner size="sm" />
              ) : (
                <FaTrash className="w-4 h-4" />
              )}
              {cleaning ? '清理中...' : '手动清理'}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* 同步状态 */}
      {syncStatus && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200"
        >
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <FaExchangeAlt className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
            数据同步状态
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
            <div className={`${syncStatus.isRunning ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'} rounded-lg p-3 sm:p-4 border`}>
              <div className="flex items-center justify-between gap-2">
                {syncStatus.isRunning ? (
                  <FaSync className="w-6 h-6 sm:w-8 sm:h-8 text-green-500 animate-spin flex-shrink-0" />
                ) : (
                  <FaDatabase className="w-6 h-6 sm:w-8 sm:h-8 text-gray-500 flex-shrink-0" />
                )}
                <span className={`text-lg sm:text-2xl font-bold ${syncStatus.isRunning ? 'text-green-700' : 'text-gray-700'}`}>
                  {syncStatus.isRunning ? '同步中' : '空闲'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-2">同步状态</p>
            </div>
            
            <div className="bg-blue-50 rounded-lg p-3 sm:p-4 border border-blue-200">
              <div className="flex items-center justify-between gap-2">
                <FaDatabase className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500 flex-shrink-0" />
                <span className="text-lg sm:text-2xl font-bold text-blue-700">{syncStatus.mongoToRedisCount}</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-2">MongoDB→Redis</p>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-3 sm:p-4 border border-purple-200">
              <div className="flex items-center justify-between gap-2">
                <FaDatabase className="w-6 h-6 sm:w-8 sm:h-8 text-purple-500 flex-shrink-0" />
                <span className="text-lg sm:text-2xl font-bold text-purple-700">{syncStatus.redisToMongoCount}</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-2">Redis→MongoDB</p>
            </div>
            
            <div className="bg-indigo-50 rounded-lg p-3 sm:p-4 border border-indigo-200">
              <div className="flex items-center justify-between gap-2">
                <FaCalendarAlt className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-500 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-indigo-700">
                  {syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleString('zh-CN') : '从未'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-2">上次同步</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <motion.button
              onClick={handleSyncIPBans}
              disabled={syncing}
              className="flex-1 px-3 sm:px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 font-medium text-sm sm:text-base flex items-center justify-center gap-2 disabled:opacity-50"
              whileHover={{ scale: syncing ? 1 : 1.02 }}
              whileTap={{ scale: syncing ? 1 : 0.98 }}
            >
              {syncing ? (
                <UnifiedLoadingSpinner size="sm" />
              ) : (
                <FaSync className="w-4 h-4" />
              )}
              {syncing ? '同步中...' : '手动同步IP封禁'}
            </motion.button>

            <motion.button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
              whileHover={{ scale: refreshing ? 1 : 1.02 }}
              whileTap={{ scale: refreshing ? 1 : 0.98 }}
            >
              <FaSync className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              刷新状态
            </motion.button>
          </div>

          {syncStatus.errors && Array.isArray(syncStatus.errors) && syncStatus.errors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4"
            >
              <h4 className="text-red-800 font-medium mb-2 flex items-center gap-2">
                <FaExclamationTriangle className="w-4 h-4" />
                同步错误
              </h4>
              <ul className="list-disc list-inside space-y-1 text-red-700 text-sm">
                {syncStatus.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* 系统信息 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-green-50 rounded-xl p-4 sm:p-6 border border-green-100"
      >
        <div className="flex items-start gap-3">
          <FaInfoCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-green-800 space-y-2">
            <p className="font-semibold">关于系统管理：</p>
            <ul className="list-disc list-inside space-y-1 text-green-700">
              <li>调度器负责执行定时清理任务，保持系统数据整洁</li>
              <li>数据同步确保Redis缓存和MongoDB数据库的一致性</li>
              <li>手动操作可用于紧急情况或测试目的</li>
              <li>系统状态监控有助于及时发现和解决问题</li>
              <li>定期检查错误日志可以预防潜在问题</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
