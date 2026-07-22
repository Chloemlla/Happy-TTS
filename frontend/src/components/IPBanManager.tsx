import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaBan, FaUnlock, FaTrash, FaSync,
  FaExclamationTriangle, FaShieldAlt, FaClock,
  FaUserShield, FaTimes, FaList
} from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { turnstileApi, IPBanStats } from '../api/turnstile';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import { useNotification } from './Notification';
import {
  InfoMetricCard,
  InfoPanel,
  InfoSectionTitle,
  logShareDangerButtonClass,
  logShareInputClass,
  logSharePanelClass,
  logShareSecondaryButtonClass,
} from './LogShareStyleScaffold';

interface BanIPModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'single' | 'batch';
}

interface UnbanIPModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'single' | 'batch';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (!isRecord(error)) return fallback;
  const response = error.response;
  if (isRecord(response)) {
    const data = response.data;
    if (isRecord(data) && typeof data.error === 'string') return data.error;
    if (isRecord(data) && typeof data.message === 'string') return data.message;
  }
  return typeof error.message === 'string' ? error.message : fallback;
}

function BanIPModal({ isOpen, onClose, onSuccess, mode }: BanIPModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    ipAddress: '',
    ipAddresses: '',
    reason: '',
    durationMinutes: 60
  });
  const { setNotification } = useNotification();

  useEffect(() => {
    if (isOpen) {
      setError('');
      setFormData({
        ipAddress: '',
        ipAddresses: '',
        reason: '',
        durationMinutes: 60
      });
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'single') {
        if (!formData.ipAddress.trim()) {
          setError('请输入IP地址');
          return;
        }
        await turnstileApi.banIP(formData.ipAddress, formData.reason, formData.durationMinutes);
        setNotification({
          message: `成功封禁IP: ${formData.ipAddress}`,
          type: 'success'
        });
      } else {
        if (!formData.ipAddresses.trim()) {
          setError('请输入IP地址列表');
          return;
        }
        const ipList = formData.ipAddresses.split('\n').filter(ip => ip.trim());
        const result = await turnstileApi.banIPs(ipList, formData.reason, formData.durationMinutes);
        setNotification({
          message: `批量封禁成功！封禁了 ${result.bannedCount} 个IP`,
          type: 'success'
        });
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('封禁IP失败:', err);
      const msg = getErrorMessage(err, '封禁失败，请重试');
      setError(msg);
      setNotification({ message: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] h-full w-full overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-0"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className={`${logSharePanelClass} relative top-0 mx-auto my-4 max-h-[95vh] w-full max-w-2xl overflow-y-auto p-4 sm:top-16 sm:my-0 sm:p-5`}
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                <FaBan className="h-5 w-5 text-slate-500" />
                {mode === 'single' ? '封禁IP' : '批量封禁IP'}
              </h3>
              <button onClick={onClose} className="p-1 text-slate-400 transition-colors hover:text-slate-600">
                <FaTimes className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'single' ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-700">IP地址或IP段（CIDR）</label>
                  <input
                    type="text"
                    required
                    className={`${logShareInputClass} mt-1`}
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                    placeholder="例如: 192.168.1.100 或 192.168.1.0/24"
                  />
                  <p className="mt-1 text-xs text-slate-500">支持单个IP或CIDR格式（IPv4: 192.168.1.0/24，IPv6: 2001:db8::/32）</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-slate-700">IP地址列表或IP段（CIDR）</label>
                  <textarea
                    required
                    rows={6}
                    className={`${logShareInputClass} mt-1`}
                    value={formData.ipAddresses}
                    onChange={(e) => setFormData({ ...formData, ipAddresses: e.target.value })}
                    placeholder="每行一个IP或IP段，例如：&#10;192.168.1.100&#10;192.168.1.0/24&#10;10.0.0.0/8&#10;2001:db8::/32"
                  />
                  <p className="mt-1 text-xs text-slate-500">每行输入一个IP地址或CIDR IP段（支持IPv4和IPv6）</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700">封禁原因</label>
                <textarea
                  required
                  rows={3}
                  className={`${logShareInputClass} mt-1`}
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="请输入封禁原因..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700">封禁时长（分钟）</label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  required
                  className={`${logShareInputClass} mt-1`}
                  value={formData.durationMinutes}
                  onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) || 60 })}
                />
                <p className="mt-1 text-xs text-slate-500">1分钟到24小时（1440分钟）</p>
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className={logShareSecondaryButtonClass}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={logShareDangerButtonClass}
                >
                  {loading ? '处理中...' : (mode === 'single' ? '封禁IP' : '批量封禁')}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  , document.body);
}

function UnbanIPModal({ isOpen, onClose, onSuccess, mode }: UnbanIPModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    ipAddress: '',
    ipAddresses: ''
  });
  const { setNotification } = useNotification();

  useEffect(() => {
    if (isOpen) {
      setError('');
      setFormData({
        ipAddress: '',
        ipAddresses: ''
      });
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'single') {
        if (!formData.ipAddress.trim()) {
          setError('请输入IP地址');
          return;
        }
        await turnstileApi.unbanIP(formData.ipAddress);
        setNotification({
          message: `成功解封IP: ${formData.ipAddress}`,
          type: 'success'
        });
      } else {
        if (!formData.ipAddresses.trim()) {
          setError('请输入IP地址列表');
          return;
        }
        const ipList = formData.ipAddresses.split('\n').filter(ip => ip.trim());
        const result = await turnstileApi.unbanIPs(ipList);
        setNotification({
          message: `批量解封成功！解封了 ${result.unbannedCount} 个IP`,
          type: 'success'
        });
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('解封IP失败:', err);
      const msg = getErrorMessage(err, '解封失败，请重试');
      setError(msg);
      setNotification({ message: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] h-full w-full overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-0"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className={`${logSharePanelClass} relative top-0 mx-auto my-4 max-h-[95vh] w-full max-w-2xl overflow-y-auto p-4 sm:top-16 sm:my-0 sm:p-5`}
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
                <FaUnlock className="h-5 w-5 text-slate-500" />
                {mode === 'single' ? '解封IP' : '批量解封IP'}
              </h3>
              <button onClick={onClose} className="p-1 text-slate-400 transition-colors hover:text-slate-600">
                <FaTimes className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'single' ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-700">IP地址或IP段（CIDR）</label>
                  <input
                    type="text"
                    required
                    className={`${logShareInputClass} mt-1`}
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                    placeholder="例如: 192.168.1.100 或 192.168.1.0/24"
                  />
                  <p className="mt-1 text-xs text-slate-500">支持单个IP或CIDR格式（IPv4: 192.168.1.0/24，IPv6: 2001:db8::/32）</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-slate-700">IP地址列表或IP段（CIDR）</label>
                  <textarea
                    required
                    rows={6}
                    className={`${logShareInputClass} mt-1`}
                    value={formData.ipAddresses}
                    onChange={(e) => setFormData({ ...formData, ipAddresses: e.target.value })}
                    placeholder="每行一个IP或IP段，例如：&#10;192.168.1.100&#10;192.168.1.0/24&#10;10.0.0.0/8&#10;2001:db8::/32"
                  />
                  <p className="mt-1 text-xs text-slate-500">每行输入一个IP地址或CIDR IP段（支持IPv4和IPv6）</p>
                </div>
              )}

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
                >
                  <FaExclamationTriangle className="w-4 h-4" />
                  {error}
                </motion.div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className={logShareSecondaryButtonClass}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={logShareSecondaryButtonClass}
                >
                  {loading ? <UnifiedLoadingSpinner size="sm" /> : <FaUnlock />}
                  {mode === 'single' ? '解封IP' : '批量解封'}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  , document.body);
}

export default function IPBanManager() {
  const [stats, setStats] = useState<IPBanStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [showUnbanModal, setShowUnbanModal] = useState(false);
  const [banMode, setBanMode] = useState<'single' | 'batch'>('single');
  const [unbanMode, setUnbanMode] = useState<'single' | 'batch'>('single');
  const { setNotification } = useNotification();

  const fetchStats = async () => {
    try {
      const data = await turnstileApi.getIPBanStats();
      setStats(data);
    } catch (error) {
      console.error('获取IP封禁统计失败:', error);
      setNotification({
        message: '获取IP封禁统计失败',
        type: 'error'
      });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
    setNotification({
      message: 'IP封禁统计已刷新',
      type: 'success'
    });
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
      <div className="flex min-h-[min(24rem,50dvh)] items-center justify-center">
        <UnifiedLoadingSpinner size="lg" text="加载IP封禁管理..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InfoPanel>
        <InfoSectionTitle
          eyebrow="Access Control"
          title="IP封禁管理"
          description="管理 IP 与 CIDR 封禁列表，支持单个和批量封禁、解封以及实时统计刷新。"
          icon={FaShieldAlt}
          action={
            <Link to="/admin" className={logShareSecondaryButtonClass}>
              <FaTimes className="w-4 h-4" />
              返回仪表板
            </Link>
          }
        />
      </InfoPanel>

      {/* 统计信息 */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <InfoMetricCard label="总封禁数" value={stats.totalBanned} detail="历史封禁记录" icon={FaBan} />
          <InfoMetricCard label="活跃封禁" value={stats.activeBans} detail="当前仍生效" icon={FaShieldAlt} />
          <InfoMetricCard label="已过期" value={stats.expiredBans} detail="等待清理或同步" icon={FaUnlock} />
          <InfoMetricCard label="最近封禁" value={stats.recentBans} detail="近期新增记录" icon={FaClock} />
        </div>
      )}

      {/* 操作按钮 */}
      <InfoPanel>
        <div className="space-y-4">
          <InfoSectionTitle eyebrow="Actions" title="封禁操作" icon={FaUserShield} />
          
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <motion.button
              onClick={() => {
                setBanMode('single');
                setShowBanModal(true);
              }}
              className={logShareDangerButtonClass}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <FaBan className="w-4 h-4" />
              单个封禁
            </motion.button>

            <motion.button
              onClick={() => {
                setBanMode('batch');
                setShowBanModal(true);
              }}
              className={logShareDangerButtonClass}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <FaList className="w-4 h-4" />
              批量封禁
            </motion.button>

            <motion.button
              onClick={() => {
                setUnbanMode('single');
                setShowUnbanModal(true);
              }}
              className={logShareSecondaryButtonClass}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <FaUnlock className="w-4 h-4" />
              单个解封
            </motion.button>

            <motion.button
              onClick={() => {
                setUnbanMode('batch');
                setShowUnbanModal(true);
              }}
              className={logShareSecondaryButtonClass}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <FaUnlock className="w-4 h-4" />
              批量解封
            </motion.button>

            <motion.button
              onClick={handleRefresh}
              disabled={refreshing}
              className={logShareSecondaryButtonClass}
              whileHover={{ scale: refreshing ? 1 : 1.02 }}
              whileTap={{ scale: refreshing ? 1 : 0.98 }}
            >
              <FaSync className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </motion.button>
          </div>
        </div>
      </InfoPanel>

      {/* 模态框 */}
      <BanIPModal
        isOpen={showBanModal}
        onClose={() => setShowBanModal(false)}
        onSuccess={handleRefresh}
        mode={banMode}
      />
      
      <UnbanIPModal
        isOpen={showUnbanModal}
        onClose={() => setShowUnbanModal(false)}
        onSuccess={handleRefresh}
        mode={unbanMode}
      />
    </div>
  );
}
