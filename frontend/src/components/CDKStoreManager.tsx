import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPlus, FaEdit, FaTrash, FaSearch, FaSync, FaInfoCircle, FaExclamationTriangle, FaCheckCircle, FaArrowLeft, FaList, FaKey, FaBox, FaClock, FaUser, FaToggleOn, FaToggleOff } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { cdksApi, CDK } from '../api/cdks';
import { resourcesApi, Resource } from '../api/resources';
import { getApiBaseUrl } from '../api/api';
import { UnifiedLoadingSpinner } from './LoadingSpinner';

interface GenerateCDKModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface EditCDKModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cdk: CDK | null;
}

function GenerateCDKModal({ isOpen, onClose, onSuccess }: GenerateCDKModalProps) {
  const [formData, setFormData] = useState({
    resourceId: '',
    count: 1,
    expiresAt: ''
  });
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchResources();
    }
  }, [isOpen]);

  const fetchResources = async () => {
    try {
      const response = await resourcesApi.getResources();
      console.log('获取到的资源列表:', response);
      setResources(response.resources || []);
    } catch (error) {
      console.error('获取资源列表失败:', error);
      setResources([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证资源ID不为空
    if (!formData.resourceId || formData.resourceId.trim() === '') {
      setError('请选择要生成CDK的资源');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      console.log('准备生成CDK，参数:', { 
        resourceId: formData.resourceId, 
        count: formData.count, 
        expiresAt: formData.expiresAt 
      });
      const expiresAt = formData.expiresAt ? new Date(formData.expiresAt) : undefined;
      await cdksApi.generateCDKs(formData.resourceId, formData.count, expiresAt);
      onSuccess();
      onClose();
      // 重置表单
      setFormData({
        resourceId: '',
        count: 1,
        expiresAt: ''
      });
    } catch (error) {
      console.error('生成CDK失败:', error);
      setError('生成CDK失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 p-4 sm:p-0"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative top-0 sm:top-20 mx-auto my-4 sm:my-0 p-4 sm:p-5 border w-full max-w-md sm:w-96 shadow-lg rounded-lg bg-white max-h-[95vh] overflow-y-auto"
        >
          <div className="mt-1 sm:mt-3">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <FaPlus className="w-5 h-5 text-purple-500" />
              生成CDK
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">选择资源</label>
                <select
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
                  value={formData.resourceId}
                  onChange={(e) => {
                    console.log('选择的资源ID:', e.target.value);
                    setFormData({ ...formData, resourceId: e.target.value });
                  }}
                >
                  <option key="default-generate" value="">
                    {resources.length === 0 ? '暂无可用资源' : '请选择资源'}
                  </option>
                  {resources.map((resource, index) => {
                    console.log('渲染资源选项:', resource);
                    return (
                      <option key={`generate-resource-${resource.id}-${index}`} value={resource.id}>
                        {resource.title} - {resource.category}
                      </option>
                    );
                  })}
                </select>
                {resources.length === 0 && (
                  <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-700 mb-2">
                      暂无可用资源。请先创建资源或初始化测试数据。
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const response = await fetch(`${getApiBaseUrl()}/api/resources/init-test`, {
                            method: 'POST',
                            headers: {
                              'Authorization': `Bearer ${localStorage.getItem('token')}`,
                              'Content-Type': 'application/json'
                            }
                          });
                          if (response.ok) {
                            fetchResources(); // 重新获取资源列表
                            alert('测试资源初始化成功！');
                          } else {
                            alert('初始化失败，请检查权限');
                          }
                        } catch (error) {
                          console.error('初始化测试资源失败:', error);
                          alert('初始化失败');
                        }
                      }}
                      className="px-3 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600 transition"
                    >
                      初始化测试资源
                    </button>
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">生成数量</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
                  value={formData.count}
                  onChange={(e) => setFormData({ ...formData, count: parseInt(e.target.value) || 1 })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">过期时间（可选）</label>
                <input
                  type="datetime-local"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                />
                <p className="mt-1 text-xs text-gray-500">留空表示永不过期</p>
              </div>

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

              <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
                <motion.button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-all duration-200"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  取消
                </motion.button>
                <motion.button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-blue-600 border border-transparent rounded-md hover:from-purple-600 hover:to-blue-700 disabled:opacity-50 transition-all duration-200"
                  whileHover={!loading ? { scale: 1.02 } : {}}
                  whileTap={!loading ? { scale: 0.98 } : {}}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <FaSync className="animate-spin w-4 h-4" />
                      生成中...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <FaPlus className="w-4 h-4" />
                      生成CDK
                    </div>
                  )}
                </motion.button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function EditCDKModal({ isOpen, onClose, onSuccess, cdk }: EditCDKModalProps) {
  const [formData, setFormData] = useState({
    code: '',
    resourceId: '',
    expiresAt: ''
  });
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 当cdk变化时，更新表单数据
  useEffect(() => {
    if (cdk) {
      setFormData({
        code: cdk.code,
        resourceId: cdk.resourceId,
        expiresAt: cdk.expiresAt ? new Date(cdk.expiresAt).toISOString().slice(0, 16) : ''
      });
    }
  }, [cdk]);

  useEffect(() => {
    if (isOpen) {
      fetchResources();
    }
  }, [isOpen]);

  const fetchResources = async () => {
    try {
      const response = await resourcesApi.getResources();
      setResources(response.resources);
    } catch (error) {
      console.error('获取资源列表失败:', error);
      setResources([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cdk) return;
    
    // 验证资源ID不为空
    if (!formData.resourceId || formData.resourceId.trim() === '') {
      setError('请选择要关联的资源');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const updateData: Partial<CDK> = {
        code: formData.code,
        resourceId: formData.resourceId,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt) : undefined
      };
      
      await cdksApi.updateCDK(cdk.id, updateData);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('更新CDK失败:', error);
      setError('更新CDK失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !cdk) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 p-4 sm:p-0"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative top-0 sm:top-20 mx-auto my-4 sm:my-0 p-4 sm:p-5 border w-full max-w-md sm:w-96 shadow-lg rounded-lg bg-white max-h-[95vh] overflow-y-auto"
        >
          <div className="mt-1 sm:mt-3">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <FaEdit className="w-5 h-5 text-blue-500" />
              编辑CDK
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">CDK代码</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">选择资源</label>
                <select
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  value={formData.resourceId}
                  onChange={(e) => setFormData({ ...formData, resourceId: e.target.value })}
                >
                  <option key="default-edit" value="">
                    {resources.length === 0 ? '暂无可用资源' : '请选择资源'}
                  </option>
                  {resources.map((resource, index) => (
                    <option key={`edit-resource-${resource.id}-${index}`} value={resource.id}>
                      {resource.title} - {resource.category}
                    </option>
                  ))}
                </select>
                {resources.length === 0 && (
                  <p className="mt-1 text-xs text-red-500">
                    暂无可用资源。请先在资源管理中创建资源。
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">过期时间（可选）</label>
                <input
                  type="datetime-local"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                />
                <p className="mt-1 text-xs text-gray-500">留空表示永不过期</p>
              </div>

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

              <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
                <motion.button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-all duration-200"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  取消
                </motion.button>
                <motion.button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-600 border border-transparent rounded-md hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 transition-all duration-200"
                  whileHover={!loading ? { scale: 1.02 } : {}}
                  whileTap={!loading ? { scale: 0.98 } : {}}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <FaSync className="animate-spin w-4 h-4" />
                      更新中...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <FaEdit className="w-4 h-4" />
                      更新CDK
                    </div>
                  )}
                </motion.button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function CDKStoreManager() {
  const [cdks, setCdks] = useState<CDK[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCDK, setEditingCDK] = useState<CDK | null>(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    console.log('CDKStoreManager: 组件已加载');
    fetchCDKs();
  }, []);

  const fetchCDKs = async () => {
    try {
      const response = await cdksApi.getCDKs();
      setCdks(response.cdks);
    } catch (error) {
      console.error('获取CDK列表失败:', error);
      // 设置默认值，防止组件崩溃
      setCdks([]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSuccess = () => {
    fetchCDKs(); // 重新获取CDK列表
  };

  const handleEditSuccess = () => {
    fetchCDKs(); // 重新获取CDK列表
  };

  const handleEdit = (cdk: CDK) => {
    setEditingCDK(cdk);
    setShowEditModal(true);
  };

  const handleDelete = async (cdk: CDK) => {
    if (window.confirm(`确定要删除CDK"${cdk.code}"吗？此操作不可撤销。`)) {
      try {
        await cdksApi.deleteCDK(cdk.id);
        fetchCDKs(); // 重新获取CDK列表
      } catch (error) {
        console.error('删除CDK失败:', error);
        alert('删除CDK失败，请重试');
      }
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCDKs().then(() => setRefreshing(false));
  };

  const filteredCDKs = cdks.filter(cdk =>
    cdk.code.toLowerCase().includes(search.toLowerCase()) ||
    cdk.resourceId.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <UnifiedLoadingSpinner size="lg" text="加载CDK列表..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和说明 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-100"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-purple-700 flex items-center gap-2">
            <FaKey className="w-6 h-6" />
            CDK管理
          </h2>
          <Link 
            to="/admin/store"
            className="px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition text-sm font-medium flex items-center gap-2"
          >
            <FaArrowLeft className="w-4 h-4" />
            返回仪表板
          </Link>
        </div>
        <div className="text-gray-600 space-y-2">
          <p>此功能用于管理CDK兑换码，支持生成、查看、删除CDK，提供完整的CDK生命周期管理。</p>
          <div className="flex items-start gap-2 text-sm">
            <FaInfoCircle className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-purple-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>支持为指定资源批量生成CDK</li>
                <li>实时搜索和筛选CDK</li>
                <li>查看CDK使用状态和时间</li>
                <li>删除未使用的CDK</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 搜索和刷新 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaSearch className="w-5 h-5 text-purple-500" />
            搜索和刷新
          </h3>
          <motion.button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
            whileTap={{ scale: 0.95 }}
          >
            <FaSync className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </motion.button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
            placeholder="搜索CDK代码或资源ID"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </motion.div>

      {/* 生成CDK按钮 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaPlus className="w-5 h-5 text-purple-500" />
            生成CDK
          </h3>
          <motion.button
            onClick={() => setShowGenerateModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-lg hover:from-purple-600 hover:to-blue-700 transition-all duration-200 font-medium flex items-center gap-2"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <FaPlus className="w-4 h-4" />
            生成CDK
          </motion.button>
        </div>
      </motion.div>

      {/* CDK列表 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FaList className="w-5 h-5 text-indigo-500" />
          CDK列表
        </h3>

        {/* 桌面端表格视图 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full text-sm text-gray-700">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-3 px-3 text-left font-semibold text-gray-700">CDK代码</th>
                <th className="py-3 px-3 text-left font-semibold text-gray-700">资源ID</th>
                <th className="py-3 px-3 text-left font-semibold text-gray-700">状态</th>
                <th className="py-3 px-3 text-left font-semibold text-gray-700">使用时间</th>
                <th className="py-3 px-3 text-left font-semibold text-gray-700">过期时间</th>
                <th className="py-3 px-3 text-center font-semibold text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredCDKs.length === 0 ? (
                <tr key="empty-state-row">
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <FaList className="text-3xl text-gray-300" />
                      <div className="text-lg font-medium text-gray-500">
                        {search ? '没有找到匹配的CDK' : '暂无CDK'}
                      </div>
                      <div className="text-sm text-gray-400">
                        {search ? '尝试调整搜索条件' : '快去生成第一个CDK吧！'}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filteredCDKs.map((cdk) => (
                <tr key={`cdk-${cdk.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-gray-900">
                    <div className="flex items-center gap-2">
                      <FaKey className="w-4 h-4 text-purple-500" />
                      {cdk.code}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <FaBox className="w-4 h-4 text-blue-500" />
                      {cdk.resourceId}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className={`inline-flex items-center gap-2 rounded-full px-2 text-xs font-semibold leading-5 ${
                      cdk.isUsed 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {cdk.isUsed ? (
                        <React.Fragment key={`used-${cdk.id}`}>
                          <FaToggleOff className="w-3 h-3" />
                          已使用
                        </React.Fragment>
                      ) : (
                        <React.Fragment key={`available-${cdk.id}`}>
                          <FaToggleOn className="w-3 h-3" />
                          可用
                        </React.Fragment>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <FaClock className="w-4 h-4 text-orange-500" />
                      {cdk.usedAt ? new Date(cdk.usedAt).toLocaleString() : '-'}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <FaClock className="w-4 h-4 text-gray-500" />
                      {cdk.expiresAt ? new Date(cdk.expiresAt).toLocaleString() : '永不过期'}
                    </div>
                  </td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <div className="flex gap-2 justify-center">
                      <motion.button 
                        onClick={() => handleEdit(cdk)}
                        className="text-blue-600 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 rounded-lg px-3 py-1 transition-all duration-150"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        查看
                      </motion.button>
                      {!cdk.isUsed && (
                        <motion.button 
                          onClick={() => handleDelete(cdk)}
                          className="text-red-600 hover:text-red-900 bg-red-100 hover:bg-red-200 rounded-lg px-3 py-1 transition-all duration-150"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          删除
                        </motion.button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 移动端卡片列表视图 */}
        <div className="md:hidden space-y-3">
          {filteredCDKs.length === 0 ? (
            <div key="empty-state-mobile" className="bg-white rounded-lg shadow p-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <FaList className="text-3xl text-gray-300" />
                <div className="text-lg font-medium text-gray-500">
                  {search ? '没有找到匹配的CDK' : '暂无CDK'}
                </div>
                <div className="text-sm text-gray-400">
                  {search ? '尝试调整搜索条件' : '快去生成第一个CDK吧！'}
                </div>
              </div>
            </div>
          ) : filteredCDKs.map((cdk) => (
            <motion.div
              key={`mobile-cdk-${cdk.id}`}
              className="bg-white rounded-lg shadow-sm border border-gray-100 p-4"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              {/* CDK代码 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FaKey className="w-5 h-5 text-purple-500" />
                  <div className="font-mono text-lg font-bold text-gray-900">
                    {cdk.code}
                  </div>
                </div>
                <div className="flex gap-2">
                  <motion.button
                    onClick={() => handleEdit(cdk)}
                    className="text-blue-600 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 rounded-lg px-3 py-1 text-sm transition-all duration-150"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    查看
                  </motion.button>
                  {!cdk.isUsed && (
                    <motion.button
                      onClick={() => handleDelete(cdk)}
                      className="text-red-600 hover:text-red-900 bg-red-100 hover:bg-red-200 rounded-lg px-3 py-1 text-sm transition-all duration-150"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      删除
                    </motion.button>
                  )}
                </div>
              </div>

              {/* 资源ID */}
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <FaBox className="w-3 h-3" />
                  资源ID
                </div>
                <div className="text-sm text-gray-700 break-all">{cdk.resourceId}</div>
              </div>

              {/* 状态和时间信息 */}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 text-xs font-semibold leading-5 ${
                    cdk.isUsed 
                      ? 'bg-red-100 text-red-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {cdk.isUsed ? (
                      <React.Fragment key={`used-mobile-${cdk.id}`}>
                        <FaToggleOff className="w-3 h-3" />
                        已使用
                      </React.Fragment>
                    ) : (
                      <React.Fragment key={`available-mobile-${cdk.id}`}>
                        <FaToggleOn className="w-3 h-3" />
                        可用
                      </React.Fragment>
                    )}
                  </span>
                  <div>
                    <span className="text-gray-400">使用时间:</span>
                    <span className="ml-1">{cdk.usedAt ? new Date(cdk.usedAt).toLocaleDateString() : '-'}</span>
                  </div>
                </div>
                <div className="text-gray-400">
                  {cdk.usedAt ? new Date(cdk.usedAt).toLocaleTimeString() : ''}
                </div>
              </div>

              {/* 过期时间 */}
              <div className="mt-2 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <FaClock className="w-3 h-3" />
                  过期时间: {cdk.expiresAt ? new Date(cdk.expiresAt).toLocaleString() : '永不过期'}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <GenerateCDKModal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        onSuccess={handleGenerateSuccess}
      />
      
      <EditCDKModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingCDK(null);
        }}
        onSuccess={handleEditSuccess}
        cdk={editingCDK}
      />
    </div>
  );
} 