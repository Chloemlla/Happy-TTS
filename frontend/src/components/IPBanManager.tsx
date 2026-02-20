import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaBan, FaUnlock, FaPlus, FaTrash, FaSearch, FaSync, FaInfoCircle, 
  FaExclamationTriangle, FaCheckCircle, FaShieldAlt, FaClock, FaChartBar,
  FaUserShield, FaNetworkWired, FaCalendarAlt, FaTimes, FaCheck, FaList
} from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { turnstileApi, IPBanStats, IPBan } from '../api/turnstile';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import { useNotification } from './Notification';

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
    } catch (err: any) {
      console.error('封禁IP失败:', err);
      const msg = err?.response?.data?.error || '封禁失败，请重试';
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
        className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-[9999] p-4 sm:p-0"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative top-0 sm:top-16 mx-auto my-4 sm:my-0 p-4 sm:p-5 border w-full max-w-2xl shadow-lg rounded-lg bg-white max-h-[95vh] overflow-y-auto"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <FaBan className="w-5 h-5 text-red-500" />
                {mode === 'single' ? '封禁IP' : '批量封禁IP'}
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                <FaTimes className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'single' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700">IP地址或IP段（CIDR）</label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                    placeholder="例如: 192.168.1.100 或 192.168.1.0/24"
                  />
                  <p className="mt-1 text-xs text-gray-500">支持单个IP或CIDR格式（IPv4: 192.168.1.0/24，IPv6: 2001:db8::/32）</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700">IP地址列表或IP段（CIDR）</label>
                  <textarea
                    required
                    rows={6}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    value={formData.ipAddresses}
                    onChange={(e) => setFormData({ ...formData, ipAddresses: e.target.value })}
                    placeholder="每行一个IP或IP段，例如：&#10;192.168.1.100&#10;192.168.1.0/24&#10;10.0.0.0/8&#10;2001:db8::/32"
                  />
                  <p className="mt-1 text-xs text-gray-500">每行输入一个IP地址或CIDR IP段（支持IPv4和IPv6）</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">封禁原因</label>
                <textarea
                  required
                  rows={3}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="请输入封禁原因..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">封禁时长（分钟）</label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  value={formData.durationMinutes}
                  onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) || 60 })}
                />
                <p className="mt-1 text-xs text-gray-500">1分钟到24小时（1440分钟）</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
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
    } catch (err: any) {
      console.error('解封IP失败:', err);
      const msg = err?.response?.data?.error || '解封失败，请重试';
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
        className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-[9999] p-4 sm:p-0"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative top-0 sm:top-16 mx-auto my-4 sm:my-0 p-4 sm:p-5 border w-full max-w-2xl shadow-lg rounded-lg bg-white max-h-[95vh] overflow-y-auto"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <FaUnlock className="w-5 h-5 text-green-500" />
                {mode === 'single' ? '解封IP' : '批量解封IP'}
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                <FaTimes className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'single' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700">IP地址或IP段（CIDR）</label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                    placeholder="例如: 192.168.1.100 或 192.168.1.0/24"
                  />
                  <p className="mt-1 text-xs text-gray-500">支持单个IP或CIDR格式（IPv4: 192.168.1.0/24，IPv6: 2001:db8::/32）</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700">IP地址列表或IP段（CIDR）</label>
                  <textarea
                    required
                    rows={6}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    value={formData.ipAddresses}
                    onChange={(e) => setFormData({ ...formData, ipAddresses: e.target.value })}
                    placeholder="每行一个IP或IP段，例如：&#10;192.168.1.100&#10;192.168.1.0/24&#10;10.0.0.0/8&#10;2001:db8::/32"
                  />
                  <p className="mt-1 text-xs text-gray-500">每行输入一个IP地址或CIDR IP段（支持IPv4和IPv6）</p>
                </div>
              )}

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200 flex items-center gap-2"
                >
                  <FaExclamationTriangle className="w-4 h-4" />
                  {error}
                </motion.div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
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
      <div className="min-h-screen flex items-center justify-center">
        <UnifiedLoadingSpinner size="lg" text="加载IP封禁管理..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和说明 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-6 border border-red-100"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-red-700 flex items-center gap-2">
            <FaShieldAlt className="w-5 h-5 sm:w-6 sm:h-6" />
            IP封禁管理
          </h2>
          <Link
            to="/admin"
            className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm font-medium flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <FaTimes className="w-4 h-4" />
            返回仪表板
          </Link>
        </div>
        <div className="text-gray-600 space-y-2">
          <p>此功能用于管理IP封禁列表，支持单个和批量封禁操作，提供实时统计信息。</p>
          <div className="flex items-start gap-2 text-sm">
            <FaInfoCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-red-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>支持单个IP和批量IP封禁操作</li>
                <li>支持CIDR格式封禁整个IP段（IPv4和IPv6）</li>
                <li>自定义封禁原因和时长</li>
                <li>实时查看IP封禁统计信息</li>
                <li>支持IP和IP段解封操作</li>
                <li>自动同步Redis和MongoDB数据</li>
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
            <FaChartBar className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
            封禁统计
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <div className="flex items-center justify-between">
                <FaBan className="w-8 h-8 text-red-500" />
                <span className="text-2xl font-bold text-red-700">{stats.totalBanned}</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">总封禁数</p>
            </div>
            
            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <div className="flex items-center justify-between">
                <FaShieldAlt className="w-8 h-8 text-orange-500" />
                <span className="text-2xl font-bold text-orange-700">{stats.activeBans}</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">活跃封禁</p>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between">
                <FaUnlock className="w-8 h-8 text-gray-500" />
                <span className="text-2xl font-bold text-gray-700">{stats.expiredBans}</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">已过期</p>
            </div>
            
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center justify-between">
                <FaClock className="w-8 h-8 text-blue-500" />
                <span className="text-2xl font-bold text-blue-700">{stats.recentBans}</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">最近封禁</p>
            </div>
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
            <FaUserShield className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
            封禁操作
          </h3>
          
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <motion.button
              onClick={() => {
                setBanMode('single');
                setShowBanModal(true);
              }}
              className="px-4 py-3 bg-gradient-to-r from-red-500 to-orange-600 text-white rounded-lg hover:from-red-600 hover:to-orange-700 transition-all duration-200 font-medium flex items-center justify-center gap-2"
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
              className="px-4 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 transition-all duration-200 font-medium flex items-center justify-center gap-2"
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
              className="px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 font-medium flex items-center justify-center gap-2"
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
              className="px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all duration-200 font-medium flex items-center justify-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <FaUnlock className="w-4 h-4" />
              批量解封
            </motion.button>

            <motion.button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium flex items-center justify-center gap-2"
              whileHover={{ scale: refreshing ? 1 : 1.02 }}
              whileTap={{ scale: refreshing ? 1 : 0.98 }}
            >
              <FaSync className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </motion.button>
          </div>
        </div>
      </motion.div>

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
