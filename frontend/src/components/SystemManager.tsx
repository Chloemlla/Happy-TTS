import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FaCog, FaPlay, FaStop, FaSync, FaInfoCircle, FaExclamationTriangle, 
  FaChartBar, FaClock, FaDatabase, FaExchangeAlt,
  FaTrash, FaRunning, FaPauseCircle, FaShieldAlt, FaLock, FaBolt
} from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { turnstileApi, type SchedulerStatus, type SyncDirectionResult, type SyncStatus, type SystemCapability } from '../api/turnstile';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import { useNotification } from './Notification';
import {
  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoSectionTitle,
  logShareDangerButtonClass,
  logShareSecondaryButtonClass,
} from './LogShareStyleScaffold';

const formatDateTime = (value?: string | null) => {
  if (!value) return '暂无';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '无效时间' : date.toLocaleString('zh-CN');
};

const formatInterval = (ms?: number) => {
  if (!ms || ms <= 0) return '未配置';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.round(minutes / 60);
  return `${hours}小时`;
};

const formatDuration = (ms?: number) => {
  if (ms === undefined) return '暂无';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const getDirectionTotal = (direction?: SyncDirectionResult) => {
  if (!direction) return 0;
  return (direction.synced || 0) + (direction.merged || 0) + (direction.updated || 0);
};

const renderCapabilityTags = (capability: SystemCapability) => (
  <div className="flex flex-wrap gap-2 mt-3">
    {capability.requiresAdmin && (
      <InfoBadge tone="emerald" className="gap-1">
        <FaLock className="w-3 h-3" />
        管理员
      </InfoBadge>
    )}
    {capability.rateLimited && (
      <InfoBadge className="gap-1">
        <FaBolt className="w-3 h-3" />
        限流
      </InfoBadge>
    )}
    {capability.audited && (
      <InfoBadge className="gap-1">
        <FaShieldAlt className="w-3 h-3" />
        审计
      </InfoBadge>
    )}
    {capability.destructive && (
      <InfoBadge tone="rose" className="gap-1">
        <FaExclamationTriangle className="w-3 h-3" />
        修改数据
      </InfoBadge>
    )}
  </div>
);

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
      return true;
    } catch (error) {
      console.error('获取调度器状态失败:', error);
      setNotification({
        message: '获取调度器状态失败',
        type: 'error'
      });
      return false;
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const data = await turnstileApi.getSyncStatus();
      setSyncStatus(data);
      return true;
    } catch (error) {
      console.error('获取同步状态失败:', error);
      setNotification({
        message: '获取同步状态失败',
        type: 'error'
      });
      return false;
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const [schedulerOk, syncOk] = await Promise.all([fetchSchedulerStatus(), fetchSyncStatus()]);
    setRefreshing(false);
    setNotification({
      message: schedulerOk && syncOk ? '系统状态已刷新' : '部分系统状态刷新失败',
      type: schedulerOk && syncOk ? 'success' : 'warning'
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
    } catch (error: unknown) {
      console.error('启动调度器失败:', error);
      const msg = error instanceof Error ? error.message : '启动调度器失败';
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
      } catch (error: unknown) {
        console.error('停止调度器失败:', error);
        const msg = error instanceof Error ? error.message : '停止调度器失败';
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
      } catch (error: unknown) {
        console.error('手动清理失败:', error);
        const msg = error instanceof Error ? error.message : '手动清理失败';
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
    } catch (error: unknown) {
      console.error('同步IP封禁失败:', error);
      const msg = error instanceof Error ? error.message : '同步IP封禁失败';
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
      <InfoPanel>
        <InfoSectionTitle
          eyebrow="Runtime Operations"
          title="系统管理"
          description="管理系统调度器、定时清理和 Redis/MongoDB 数据同步，集中查看运行状态与最近执行结果。"
          icon={FaCog}
          action={
            <Link to="/admin" className={logShareSecondaryButtonClass}>
              <FaInfoCircle className="w-4 h-4" />
              返回仪表板
            </Link>
          }
        />
      </InfoPanel>

      {/* 能力范围 */}
      {schedulerStatus && schedulerStatus.capabilities.length > 0 && (
        <InfoPanel>
          <InfoSectionTitle
            eyebrow="Capability"
            title="能力范围与安全边界"
            icon={FaShieldAlt}
            action={<span className="text-xs text-slate-500">后端确认 · 管理限流 · 操作审计</span>}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {schedulerStatus.capabilities.map((capability) => (
              <div
                key={capability.key}
                className={`${capability.enabled ? 'bg-white/80 border-slate-200' : 'bg-slate-50 border-slate-200 opacity-75'} rounded-2xl p-4 border`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{capability.label}</p>
                    <p className="text-sm text-slate-600 mt-1">{capability.description}</p>
                  </div>
                  <InfoBadge tone={capability.enabled ? 'emerald' : 'slate'}>
                    {capability.enabled ? '可用' : '不可用'}
                  </InfoBadge>
                </div>

                <div className="mt-3 text-xs text-slate-600">
                  <span className="font-medium text-slate-700">范围：</span>
                  <code className="ml-1 break-all text-slate-700">{capability.scope}</code>
                </div>
                {capability.intervalMs && (
                  <div className="mt-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">周期：</span>
                    {formatInterval(capability.intervalMs)}
                  </div>
                )}
                {renderCapabilityTags(capability)}
              </div>
            ))}
          </div>
        </InfoPanel>
      )}

      {/* 调度器状态 */}
      {schedulerStatus && (
        <InfoPanel>
          <InfoSectionTitle eyebrow="Scheduler" title="调度器状态" icon={FaRunning} />
          
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <InfoMetricCard
              label="运行状态"
              value={schedulerStatus.isRunning ? '运行中' : '已停止'}
              detail={`周期 ${formatInterval(schedulerStatus.cleanupIntervalMs)}`}
              icon={schedulerStatus.isRunning ? FaPlay : FaPauseCircle}
            />
            <InfoMetricCard label="总清理次数" value={schedulerStatus.totalCleanups} detail={`错误 ${schedulerStatus.errors}`} icon={FaChartBar} />
            <InfoMetricCard label="上次清理" value={formatDateTime(schedulerStatus.lastCleanup)} detail={`下次 ${formatDateTime(schedulerStatus.nextCleanup)}`} icon={FaClock} />
          </div>

          {schedulerStatus.lastCleanupResult && (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">最近清理总数</p>
                <p className="text-lg font-semibold text-slate-800">{schedulerStatus.lastCleanupResult.totalCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">临时指纹</p>
                <p className="text-lg font-semibold text-slate-800">{schedulerStatus.lastCleanupResult.fingerprintCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">访问密钥</p>
                <p className="text-lg font-semibold text-slate-800">{schedulerStatus.lastCleanupResult.accessTokenCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">IP封禁</p>
                <p className="text-lg font-semibold text-slate-800">{schedulerStatus.lastCleanupResult.ipBanCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">IP信息</p>
                <p className="text-lg font-semibold text-slate-800">{schedulerStatus.lastCleanupResult.ipDataCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">耗时</p>
                <p className="text-lg font-semibold text-slate-800">{formatDuration(schedulerStatus.lastCleanupDurationMs)}</p>
              </div>
            </div>
          )}

          {schedulerStatus.lastCleanupError && (
            <div className="my-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <FaExclamationTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{schedulerStatus.lastCleanupError}</span>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <motion.button
              onClick={handleStartScheduler}
              disabled={starting || schedulerStatus.isRunning}
              className={`${logShareSecondaryButtonClass} flex-1`}
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
              className={`${logShareDangerButtonClass} flex-1`}
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
              className={`${logShareSecondaryButtonClass} flex-1`}
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
        </InfoPanel>
      )}

      {/* 同步状态 */}
      {syncStatus && (
        <InfoPanel>
          <InfoSectionTitle eyebrow="Sync Runtime" title="数据同步状态" icon={FaExchangeAlt} />
          
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <InfoMetricCard
              label="同步状态"
              value={syncStatus.isSyncing ? '同步中' : syncStatus.isRunning ? '已启用' : '未启用'}
              detail={`Redis ${syncStatus.redisAvailable ? '可用' : '不可用'}`}
              icon={syncStatus.isSyncing ? FaSync : FaDatabase}
            />
            <InfoMetricCard label="MongoDB 到 Redis" value={syncStatus.mongoToRedisCount} detail={`Redis 到 MongoDB ${syncStatus.redisToMongoCount}`} icon={FaDatabase} />
            <InfoMetricCard label="同步次数" value={syncStatus.totalSyncs} detail={`错误 ${syncStatus.totalErrors}`} icon={FaChartBar} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-xs text-slate-500">上次同步</p>
              <p className="text-sm font-semibold text-slate-800">{formatDateTime(syncStatus.lastSync)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-xs text-slate-500">下次同步</p>
              <p className="text-sm font-semibold text-slate-800">{formatDateTime(syncStatus.nextSync)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-xs text-slate-500">同步周期 / 最近耗时</p>
              <p className="text-sm font-semibold text-slate-800">
                {formatInterval(syncStatus.syncIntervalMs)} · {formatDuration(syncStatus.lastSyncDurationMs)}
              </p>
            </div>
          </div>

          {syncStatus.lastSyncResult && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Mongo新增/合并</p>
                <p className="text-lg font-semibold text-slate-800">{getDirectionTotal(syncStatus.lastSyncResult.mongoToRedis)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Redis新增/更新</p>
                <p className="text-lg font-semibold text-slate-800">{getDirectionTotal(syncStatus.lastSyncResult.redisToMongo)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">跳过</p>
                <p className="text-lg font-semibold text-slate-800">
                  {(syncStatus.lastSyncResult.mongoToRedis.skipped || 0) + (syncStatus.lastSyncResult.redisToMongo.skipped || 0)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">方向错误</p>
                <p className="text-lg font-semibold text-slate-800">
                  {(syncStatus.lastSyncResult.mongoToRedis.errors || 0) + (syncStatus.lastSyncResult.redisToMongo.errors || 0)}
                </p>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <motion.button
              onClick={handleSyncIPBans}
              disabled={syncing || !syncStatus.redisAvailable}
              className={`${logShareSecondaryButtonClass} flex-1`}
              whileHover={{ scale: syncing || !syncStatus.redisAvailable ? 1 : 1.02 }}
              whileTap={{ scale: syncing || !syncStatus.redisAvailable ? 1 : 0.98 }}
            >
              {syncing ? (
                <UnifiedLoadingSpinner size="sm" />
              ) : (
                <FaSync className="w-4 h-4" />
              )}
              {syncing ? '同步中...' : syncStatus.redisAvailable ? '手动同步IP封禁' : 'Redis不可用'}
            </motion.button>

            <motion.button
              onClick={handleRefresh}
              disabled={refreshing}
              className={logShareSecondaryButtonClass}
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
              className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4"
            >
              <h4 className="text-rose-700 font-medium mb-2 flex items-center gap-2">
                <FaExclamationTriangle className="w-4 h-4" />
                同步错误
              </h4>
              <ul className="list-disc list-inside space-y-1 text-rose-700 text-sm">
                {syncStatus.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </motion.div>
          )}
        </InfoPanel>
      )}

      {/* 系统信息 */}
      <InfoPanel>
        <InfoSectionTitle
          eyebrow="Runtime Notes"
          title="系统管理说明"
          description="调度器负责定时清理，数据同步负责 Redis 缓存与 MongoDB 数据一致性。手动操作适合紧急维护和状态校验。"
          icon={FaInfoCircle}
        />
      </InfoPanel>
    </div>
  );
}
