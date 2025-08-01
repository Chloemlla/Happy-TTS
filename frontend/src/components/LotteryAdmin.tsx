import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useLottery } from '../hooks/useLottery';
import { LotteryPrize, LotteryRound } from '../types/lottery';
import * as lotteryApi from '../api/lottery';
import getApiBaseUrl, { getApiBaseUrl as namedGetApiBaseUrl } from '../api';
import { useNotification } from './Notification';
import { AnimatePresence } from 'framer-motion';
import { deleteAllRounds } from '../api/lottery';
import CryptoJS from 'crypto-js';
import { 
  FaChartBar, 
  FaList,
  FaDice,
  FaTrophy,
  FaEdit,
  FaTrash,
  FaPlay,
  FaPause,
  FaRedo,
  FaExclamationTriangle
} from 'react-icons/fa';

// AES-256解密函数
function decryptAES256(encryptedData: string, iv: string, key: string): string {
  try {
    console.log('   开始AES-256解密...');
    console.log('   密钥长度:', key.length);
    console.log('   加密数据长度:', encryptedData.length);
    console.log('   IV长度:', iv.length);
    
    const keyBytes = CryptoJS.SHA256(key);
    const ivBytes = CryptoJS.enc.Hex.parse(iv);
    const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);
    
    console.log('   密钥哈希完成，开始解密...');
    
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encryptedBytes },
      keyBytes,
      {
        iv: ivBytes,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );
    
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    console.log('   解密完成，结果长度:', result.length);
    
    return result;
  } catch (error) {
    console.error('❌ AES-256解密失败:', error);
    throw new Error('解密失败');
  }
}

// 创建轮次表单组件
const CreateRoundForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const { setNotification } = useNotification();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startTime: '',
    endTime: '',
    prizes: [] as LotteryPrize[]
  });
  const [loading, setLoading] = useState(false);

  const addPrize = () => {
    const newPrize: LotteryPrize = {
      id: Date.now().toString(),
      name: '',
      description: '',
      value: 0,
      probability: 0.1,
      quantity: 1,
      remaining: 1,
      category: 'common'
    };
    setFormData(prev => ({
      ...prev,
      prizes: [...prev.prizes, newPrize]
    }));
  };

  const updatePrize = (index: number, field: keyof LotteryPrize, value: any) => {
    setFormData(prev => ({
      ...prev,
      prizes: prev.prizes.map((prize, i) => 
        i === index ? { ...prize, [field]: value } : prize
      )
    }));
  };

  const removePrize = (index: number) => {
    setFormData(prev => ({
      ...prev,
      prizes: prev.prizes.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.prizes.length === 0) {
      setNotification({ message: '请至少添加一个奖品', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const resp = await lotteryApi.createLotteryRound(formData);
      setNotification({ message: '抽奖轮次创建成功', type: 'success' });
      if (resp && (resp as any).warning) {
        setNotification({ message: `后端已自动修正部分数据：${(resp as any).warning}`, type: 'warning' });
      }
      // 新增：弹窗询问是否保留表单
      if (window.confirm('抽奖轮次创建成功，是否保留当前表单内容？\n选择"确定"保留，选择"取消"清空表单。')) {
        // 保留表单内容
      } else {
        setFormData({
          name: '',
          description: '',
          startTime: '',
          endTime: '',
          prizes: []
        });
      }
      onSuccess();
    } catch (error) {
      setNotification({ message: error instanceof Error ? error.message : '创建失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        🎯
        创建抽奖轮次
      </h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            轮次名称
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            描述
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
            rows={3}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              开始时间
            </label>
            <input
              type="datetime-local"
              value={formData.startTime}
              onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              结束时间
            </label>
            <input
              type="datetime-local"
              value={formData.endTime}
              onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
              required
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-semibold text-gray-700">
              奖品列表
            </label>
            <motion.button
              type="button"
              onClick={addPrize}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium"
              whileTap={{ scale: 0.95 }}
            >
              添加奖品
            </motion.button>
          </div>
          
          <div className="space-y-3">
            {formData.prizes.map((prize, index) => (
              <motion.div 
                key={prize.id} 
                className="border-2 border-gray-200 rounded-lg p-4 bg-gray-50"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-800">奖品 {index + 1}</h4>
                  <motion.button
                    type="button"
                    onClick={() => removePrize(index)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                    whileTap={{ scale: 0.95 }}
                  >
                    删除
                  </motion.button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">名称</label>
                    <input
                      type="text"
                      value={prize.name}
                      onChange={(e) => updatePrize(index, 'name', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">描述</label>
                    <input
                      type="text"
                      value={prize.description}
                      onChange={(e) => updatePrize(index, 'description', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">价值 (¥)</label>
                    <input
                      type="number"
                      value={prize.value}
                      onChange={(e) => updatePrize(index, 'value', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">概率 (0-1)</label>
                    <input
                      type="number"
                      value={prize.probability}
                      onChange={(e) => updatePrize(index, 'probability', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      min="0"
                      max="1"
                      step="0.01"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">数量</label>
                    <input
                      type="number"
                      value={prize.quantity}
                      onChange={(e) => updatePrize(index, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      min="1"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">稀有度</label>
                    <select
                      value={prize.category}
                      onChange={(e) => updatePrize(index, 'category', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      <option value="common">普通</option>
                      <option value="rare">稀有</option>
                      <option value="epic">史诗</option>
                      <option value="legendary">传说</option>
                    </select>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition font-medium"
          whileTap={{ scale: 0.95 }}
        >
          {loading ? '创建中...' : '创建轮次'}
        </motion.button>
      </form>
    </motion.div>
  );
};

// 轮次管理组件
const RoundManagement: React.FC<{ rounds: LotteryRound[]; onRefresh: () => void }> = ({ rounds, onRefresh }) => {
  const { setNotification } = useNotification();
  const [loading, setLoading] = useState<string | null>(null);

  // 防御性处理，确保 rounds 一定为数组
  const safeRounds = Array.isArray(rounds) ? rounds : [];

  const handleResetRound = async (roundId: string) => {
    if (!confirm('确定要重置这个轮次吗？这将清空所有参与者和获奖者记录。')) {
      return;
    }

    setLoading(roundId);
    try {
      await lotteryApi.resetRound(roundId);
      setNotification({ message: '轮次重置成功', type: 'success' });
      onRefresh();
    } catch (error) {
      setNotification({ message: error instanceof Error ? error.message : '重置失败', type: 'error' });
    } finally {
      setLoading(null);
    }
  };

  const handleToggleStatus = async (roundId: string, isActive: boolean) => {
    setLoading(roundId);
    try {
      await lotteryApi.updateRoundStatus(roundId, !isActive);
      setNotification({ message: '状态更新成功', type: 'success' });
      onRefresh();
    } catch (error) {
      setNotification({ message: error instanceof Error ? error.message : '更新失败', type: 'error' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <motion.div
      className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <FaChartBar className="text-lg text-blue-500" />
        轮次管理
      </h3>
      
      <div className="space-y-4">
        {safeRounds.map((round) => (
          <motion.div 
            key={round.id} 
            className="border-2 border-gray-200 rounded-lg p-4 bg-gray-50"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-bold text-lg text-gray-800">{round.name}</h4>
                <p className="text-gray-600 text-sm">{round.description}</p>
              </div>
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                round.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {round.isActive ? '活跃' : '非活跃'}
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600 mb-3">
              <div>参与: {round.participants.length}</div>
              <div>中奖: {round.winners.length}</div>
              <div>奖品: {round.prizes.length}</div>
              <div>区块: {round.blockchainHeight}</div>
            </div>
            
            <div className="flex space-x-2">
              <motion.button
                onClick={() => handleToggleStatus(round.id, round.isActive)}
                disabled={loading === round.id}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 text-sm font-medium"
                whileTap={{ scale: 0.95 }}
              >
                {loading === round.id ? '处理中...' : (round.isActive ? '停用' : '启用')}
              </motion.button>
              <motion.button
                onClick={() => handleResetRound(round.id)}
                disabled={loading === round.id}
                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 text-sm font-medium"
                whileTap={{ scale: 0.95 }}
              >
                {loading === round.id ? '处理中...' : '重置'}
              </motion.button>
            </div>
          </motion.div>
        ))}
        
        {safeRounds.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            暂无抽奖轮次
          </div>
        )}
      </div>
    </motion.div>
  );
};

// 主管理员组件
const LotteryAdmin: React.FC = () => {
  const { user } = useAuth();
  const { allRounds, fetchAllRounds } = useLottery();
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');
  const { setNotification } = useNotification();

  // 检查管理员权限
  if (!user || user.role !== 'admin') {
    return (
      <motion.div 
        className="space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div 
          className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-6 border border-red-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl font-bold text-red-700 mb-3 flex items-center gap-2">
            🔒
            访问被拒绝
          </h2>
          <div className="text-gray-600 space-y-2">
            <p>你不是管理员，禁止访问！请用管理员账号登录后再来。</p>
            <div className="text-sm text-red-500 italic">
              抽奖管理仅限管理员使用
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // 新增：一键删除所有轮次
  const handleDeleteAllRounds = async () => {
    if (!window.confirm('确定要删除所有抽奖轮次吗？此操作不可恢复！')) return;
    try {
      await deleteAllRounds();
      setNotification({ message: '所有轮次已删除', type: 'success' });
      fetchAllRounds();
    } catch (err: any) {
      setNotification({ message: err?.message || '删除失败', type: 'error' });
    }
  };

  return (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* 标题和说明 */}
      <motion.div 
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="text-2xl font-bold text-blue-700 mb-3 flex items-center gap-2">
          <FaDice className="text-2xl text-blue-600" />
          抽奖管理
        </h2>
        <div className="text-gray-600 space-y-2">
          <p>管理抽奖轮次和奖品，包括创建、编辑、删除轮次和奖品管理。</p>
          <div className="flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>创建新的抽奖轮次</li>
                <li>管理轮次状态和奖品</li>
                <li>查看参与者和获奖者</li>
                <li>重置轮次数据</li>
                <li>删除所有轮次</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 标签页切换 */}
      <motion.div 
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaList className="text-lg text-blue-500" />
            功能面板
          </h3>
          {activeTab === 'manage' && (
            <motion.button
              onClick={handleDeleteAllRounds}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium"
              whileTap={{ scale: 0.95 }}
            >
              删除所有轮次
            </motion.button>
          )}
        </div>

        <div className="flex justify-center mb-6">
          <div className="bg-gray-100 rounded-lg p-1">
            <motion.button
              onClick={() => setActiveTab('create')}
              className={`px-6 py-2 rounded-md transition-colors font-medium ${
                activeTab === 'create'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              whileTap={{ scale: 0.95 }}
            >
              创建轮次
            </motion.button>
            <motion.button
              onClick={() => setActiveTab('manage')}
              className={`px-6 py-2 rounded-md transition-colors font-medium ${
                activeTab === 'manage'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              whileTap={{ scale: 0.95 }}
            >
              轮次管理
            </motion.button>
          </div>
        </div>

        {/* 内容区域 */}
        <AnimatePresence mode="wait">
          {activeTab === 'create' ? (
            <motion.div
              key="create"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <CreateRoundForm onSuccess={fetchAllRounds} />
            </motion.div>
          ) : (
            <motion.div
              key="manage"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <RoundManagement rounds={allRounds} onRefresh={fetchAllRounds} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}; 

export default LotteryAdmin; 