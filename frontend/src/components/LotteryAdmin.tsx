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
      if (window.confirm('抽奖轮次创建成功，是否保留当前表单内容？\n选择“确定”保留，选择“取消”清空表单。')) {
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-lg p-6 border border-gray-200"
    >
      <h3 className="text-xl font-bold text-gray-800 mb-4">创建抽奖轮次</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            轮次名称
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            描述
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              开始时间
            </label>
            <input
              type="datetime-local"
              value={formData.startTime}
              onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              结束时间
            </label>
            <input
              type="datetime-local"
              value={formData.endTime}
              onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">
              奖品列表
            </label>
            <button
              type="button"
              onClick={addPrize}
              className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              添加奖品
            </button>
          </div>
          
          <div className="space-y-3">
            {formData.prizes.map((prize, index) => (
              <div key={prize.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium">奖品 {index + 1}</h4>
                  <button
                    type="button"
                    onClick={() => removePrize(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    删除
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">名称</label>
                    <input
                      type="text"
                      value={prize.name}
                      onChange={(e) => updatePrize(index, 'name', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">描述</label>
                    <input
                      type="text"
                      value={prize.description}
                      onChange={(e) => updatePrize(index, 'description', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">价值 (¥)</label>
                    <input
                      type="number"
                      value={prize.value}
                      onChange={(e) => updatePrize(index, 'value', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
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
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
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
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      min="1"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">稀有度</label>
                    <select
                      value={prize.category}
                      onChange={(e) => updatePrize(index, 'category', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="common">普通</option>
                      <option value="rare">稀有</option>
                      <option value="epic">史诗</option>
                      <option value="legendary">传说</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
        >
          {loading ? '创建中...' : '创建轮次'}
        </button>
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-lg p-6 border border-gray-200"
    >
      <h3 className="text-xl font-bold text-gray-800 mb-4">轮次管理</h3>
      
      <div className="space-y-4">
        {safeRounds.map((round) => (
          <div key={round.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-bold text-lg">{round.name}</h4>
                <p className="text-gray-600 text-sm">{round.description}</p>
              </div>
              <div className={`px-2 py-1 rounded text-xs font-medium ${
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
              <button
                onClick={() => handleToggleStatus(round.id, round.isActive)}
                disabled={loading === round.id}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 text-sm"
              >
                {loading === round.id ? '处理中...' : (round.isActive ? '停用' : '启用')}
              </button>
              <button
                onClick={() => handleResetRound(round.id)}
                disabled={loading === round.id}
                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 text-sm"
              >
                {loading === round.id ? '处理中...' : '重置'}
              </button>
            </div>
          </div>
        ))}
        
        {safeRounds.length === 0 && (
          <div className="text-center text-gray-500 py-8">
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <span style={{ fontSize: 120, lineHeight: 1 }}>🤡</span>
        <div className="text-3xl font-bold mt-6 mb-2 text-rose-600 drop-shadow-lg">你不是管理员，禁止访问！</div>
        <div className="text-lg text-gray-500 mb-8">请用管理员账号登录后再来玩哦~<br/><span className="text-rose-400">（小丑竟是你自己）</span></div>
        <div className="text-base text-gray-400 italic mt-4">仅限管理员使用，恶搞界面仅供娱乐。</div>
      </div>
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 页面标题 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-4xl font-bold text-gray-800 mb-2">抽奖管理</h1>
          <p className="text-gray-600">管理抽奖轮次和奖品</p>
        </motion.div>

        {/* 新增：一键删除所有轮次按钮，仅在管理页显示 */}
        {activeTab === 'manage' && (
          <div className="flex justify-end">
            <button
              onClick={handleDeleteAllRounds}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow transition-all"
            >
              删除所有轮次
            </button>
          </div>
        )}

        {/* 标签页切换 */}
        <div className="flex justify-center">
          <div className="bg-white rounded-lg shadow-lg p-1">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-6 py-2 rounded-md transition-colors ${
                activeTab === 'create'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              创建轮次
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`px-6 py-2 rounded-md transition-colors ${
                activeTab === 'manage'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              轮次管理
            </button>
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
            >
              <CreateRoundForm onSuccess={fetchAllRounds} />
            </motion.div>
          ) : (
            <motion.div
              key="manage"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <RoundManagement rounds={allRounds} onRefresh={fetchAllRounds} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}; 

export default LotteryAdmin; 