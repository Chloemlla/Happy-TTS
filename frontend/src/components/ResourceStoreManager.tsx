import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPlus, FaEdit, FaTrash, FaSearch, FaSync, FaInfoCircle, FaExclamationTriangle, FaCheckCircle, FaArrowLeft, FaList, FaBox, FaTag, FaDollarSign, FaToggleOn, FaToggleOff, FaChevronLeft, FaChevronRight, FaAngleDoubleLeft, FaAngleDoubleRight } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { resourcesApi, Resource } from '../api/resources';
import { UnifiedLoadingSpinner } from './LoadingSpinner';

interface AddResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface EditResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  resource: Resource | null;
}

function AddResourceModal({ isOpen, onClose, onSuccess }: AddResourceModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    downloadUrl: '',
    price: 0,
    category: '',
    imageUrl: '',
    isActive: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await resourcesApi.createResource(formData);
      onSuccess();
      onClose();
      // 重置表单
      setFormData({
        title: '',
        description: '',
        downloadUrl: '',
        price: 0,
        category: '',
        imageUrl: '',
        isActive: true
      });
    } catch (error) {
      console.error('创建资源失败:', error);
      setError('创建资源失败，请重试');
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
              <FaPlus className="w-5 h-5 text-green-500" />
              添加新资源
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">标题</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">描述</label>
                <textarea
                  required
                  rows={3}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">下载链接</label>
                <input
                  type="url"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200"
                  value={formData.downloadUrl}
                  onChange={(e) => setFormData({ ...formData, downloadUrl: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">价格</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">分类</label>
                <select
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="">请选择分类</option>
                  <option value="软件">软件</option>
                  <option value="游戏">游戏</option>
                  <option value="教程">教程</option>
                  <option value="素材">素材</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">图片URL</label>
                <input
                  type="url"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                />
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                  激活状态
                </label>
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
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-green-500 to-blue-600 border border-transparent rounded-md hover:from-green-600 hover:to-blue-700 disabled:opacity-50 transition-all duration-200"
                  whileHover={!loading ? { scale: 1.02 } : {}}
                  whileTap={!loading ? { scale: 0.98 } : {}}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <FaSync className="animate-spin w-4 h-4" />
                      创建中...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <FaPlus className="w-4 h-4" />
                      创建资源
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

function EditResourceModal({ isOpen, onClose, onSuccess, resource }: EditResourceModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    downloadUrl: '',
    price: 0,
    category: '',
    imageUrl: '',
    isActive: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 当resource变化时，更新表单数据
  useEffect(() => {
    if (resource) {
      setFormData({
        title: resource.title,
        description: resource.description,
        downloadUrl: resource.downloadUrl,
        price: resource.price,
        category: resource.category,
        imageUrl: resource.imageUrl,
        isActive: resource.isActive
      });
    }
  }, [resource]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resource) return;
    
    setLoading(true);
    setError('');

    try {
      await resourcesApi.updateResource(resource.id, formData);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('更新资源失败:', error);
      setError('更新资源失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !resource) return null;

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
              编辑资源
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">标题</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">描述</label>
                <textarea
                  required
                  rows={3}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">下载链接</label>
                <input
                  type="url"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  value={formData.downloadUrl}
                  onChange={(e) => setFormData({ ...formData, downloadUrl: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">价格</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">分类</label>
                <select
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="">请选择分类</option>
                  <option value="软件">软件</option>
                  <option value="游戏">游戏</option>
                  <option value="教程">教程</option>
                  <option value="素材">素材</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">图片URL</label>
                <input
                  type="url"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                />
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editIsActive"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <label htmlFor="editIsActive" className="ml-2 block text-sm text-gray-900">
                  激活状态
                </label>
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
                      更新资源
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

export default function ResourceStoreManager() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [search, setSearch] = useState('');
  // 分页相关状态
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchResources();
  }, []);

  // 当页码变化时重新获取数据
  useEffect(() => {
    if (currentPage > 1) {
      fetchResources();
    }
  }, [currentPage]);

  const fetchResources = async (page = currentPage) => {
    try {
      setLoading(true);
      const response = await resourcesApi.getResources(page);
      setResources(response.resources);
      setTotalItems(response.total);
      setCurrentPage(response.page);
      setPageSize(response.pageSize);
      setTotalPages(Math.ceil(response.total / response.pageSize));
    } catch (error) {
      console.error('获取资源列表失败:', error);
      setResources([]);
      setTotalItems(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSuccess = () => {
    fetchResources(); // 重新获取资源列表
  };

  const handleEditSuccess = () => {
    fetchResources(); // 重新获取资源列表
  };

  // 分页控制函数
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      setCurrentPage(page);
    }
  };

  const handleFirstPage = () => handlePageChange(1);
  const handlePrevPage = () => handlePageChange(currentPage - 1);
  const handleNextPage = () => handlePageChange(currentPage + 1);
  const handleLastPage = () => handlePageChange(totalPages);

  // 生成页码按钮数组
  const generatePageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // 调整起始页，确保显示足够的页码
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  };

  const handleEdit = (resource: Resource) => {
    setEditingResource(resource);
    setShowEditModal(true);
  };

  const handleDelete = async (resource: Resource) => {
    if (window.confirm(`确定要删除资源"${resource.title}"吗？此操作不可撤销。`)) {
      try {
        await resourcesApi.deleteResource(resource.id);
        fetchResources(); // 重新获取资源列表
      } catch (error) {
        console.error('删除资源失败:', error);
        alert('删除资源失败，请重试');
      }
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchResources().then(() => setRefreshing(false));
  };

  const filteredResources = resources.filter(resource =>
    resource.title.toLowerCase().includes(search.toLowerCase()) ||
    resource.description.toLowerCase().includes(search.toLowerCase()) ||
    resource.category.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <UnifiedLoadingSpinner size="lg" text="加载资源列表..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和说明 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 border border-green-100"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-green-700 flex items-center gap-2">
            <FaBox className="w-6 h-6" />
            资源管理
          </h2>
          <Link 
            to="/admin/store"
            className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm font-medium flex items-center gap-2"
          >
            <FaArrowLeft className="w-4 h-4" />
            返回仪表板
          </Link>
        </div>
        <div className="text-gray-600 space-y-2">
          <p>此功能用于管理资源商店中的所有资源，支持添加、编辑、删除和搜索资源，提供完整的资源生命周期管理。</p>
          <div className="flex items-start gap-2 text-sm">
            <FaInfoCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>支持添加新资源，设置标题、描述、价格等</li>
                <li>实时搜索和筛选资源</li>
                <li>编辑和删除现有资源</li>
                <li>资源状态管理（激活/停用）</li>
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
            <FaSearch className="w-5 h-5 text-green-500" />
            搜索和刷新
          </h3>
          <motion.button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
            whileTap={{ scale: 0.95 }}
          >
            <FaSync className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </motion.button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200"
            placeholder="搜索资源标题、描述或分类"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </motion.div>

      {/* 添加资源按钮 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaPlus className="w-5 h-5 text-green-500" />
            添加资源
          </h3>
          <motion.button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-green-500 to-blue-600 text-white rounded-lg hover:from-green-600 hover:to-blue-700 transition-all duration-200 font-medium flex items-center gap-2"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <FaPlus className="w-4 h-4" />
            添加资源
          </motion.button>
        </div>
      </motion.div>

      {/* 资源列表 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FaList className="w-5 h-5 text-indigo-500" />
          资源列表
        </h3>

        {/* 桌面端表格视图 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full text-sm text-gray-700">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-3 px-3 text-left font-semibold text-gray-700">资源</th>
                <th className="py-3 px-3 text-left font-semibold text-gray-700">分类</th>
                <th className="py-3 px-3 text-left font-semibold text-gray-700">价格</th>
                <th className="py-3 px-3 text-left font-semibold text-gray-700">状态</th>
                <th className="py-3 px-3 text-center font-semibold text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredResources.length === 0 ? (
                <tr key="empty-state-row">
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <FaList className="text-3xl text-gray-300" />
                      <div className="text-lg font-medium text-gray-500">
                        {search ? '没有找到匹配的资源' : '暂无资源'}
                      </div>
                      <div className="text-sm text-gray-400">
                        {search ? '尝试调整搜索条件' : '快去添加第一个资源吧！'}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredResources.map((resource) => (
                  <tr key={`resource-${resource.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <img
                            className="h-10 w-10 rounded-full object-cover"
                            src={resource.imageUrl || '/placeholder.jpg'}
                            alt=""
                          />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {resource.title}
                          </div>
                          <div className="text-sm text-gray-500">
                            {resource.description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <FaTag className="w-4 h-4 text-blue-500" />
                        {resource.category}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <FaDollarSign className="w-4 h-4 text-green-500" />
                        ¥{resource.price}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`inline-flex items-center gap-2 rounded-full px-2 text-xs font-semibold leading-5 ${
                        resource.isActive 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {resource.isActive ? (
                          <>
                            <FaToggleOn className="w-3 h-3" />
                            激活
                          </>
                        ) : (
                          <>
                            <FaToggleOff className="w-3 h-3" />
                            停用
                          </>
                        )}
                      </span>
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                      <div className="flex gap-2 justify-center">
                        <motion.button 
                          onClick={() => handleEdit(resource)}
                          className="text-indigo-600 hover:text-indigo-900 bg-indigo-100 hover:bg-indigo-200 rounded-lg px-3 py-1 transition-all duration-150"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          编辑
                        </motion.button>
                        <motion.button 
                          onClick={() => handleDelete(resource)}
                          className="text-red-600 hover:text-red-900 bg-red-100 hover:bg-red-200 rounded-lg px-3 py-1 transition-all duration-150"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          删除
                        </motion.button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 移动端卡片列表视图 */}
        <div className="md:hidden space-y-3">
          {filteredResources.length === 0 ? (
            <div key="empty-state-mobile" className="bg-white rounded-lg shadow p-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <FaList className="text-3xl text-gray-300" />
                <div className="text-lg font-medium text-gray-500">
                  {search ? '没有找到匹配的资源' : '暂无资源'}
                </div>
                <div className="text-sm text-gray-400">
                  {search ? '尝试调整搜索条件' : '快去添加第一个资源吧！'}
                </div>
              </div>
            </div>
          ) : (
            filteredResources.map((resource) => (
              <motion.div
                key={`mobile-resource-${resource.id}`}
                className="bg-white rounded-lg shadow-sm border border-gray-100 p-4"
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                {/* 资源信息 */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-12 w-12 flex-shrink-0">
                    <img
                      className="h-12 w-12 rounded-lg object-cover"
                      src={resource.imageUrl || '/placeholder.jpg'}
                      alt=""
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-semibold text-gray-900 mb-1 truncate">
                      {resource.title}
                    </div>
                    <div className="text-sm text-gray-600 break-all line-clamp-2">
                      {resource.description}
                    </div>
                  </div>
                </div>

                {/* 分类和价格 */}
                <div className="flex flex-col gap-2 mb-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <FaTag className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <span className="truncate">{resource.category}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-green-600">
                    <FaDollarSign className="w-4 h-4 flex-shrink-0" />
                    <span>¥{resource.price}</span>
                  </div>
                </div>

                {/* 状态和操作 */}
                <div className="flex flex-col gap-3">
                  <span className={`inline-flex items-center gap-2 rounded-full px-2 text-xs font-semibold leading-5 w-fit ${
                    resource.isActive 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {resource.isActive ? (
                      <>
                        <FaToggleOn className="w-3 h-3" />
                        激活
                      </>
                    ) : (
                      <>
                        <FaToggleOff className="w-3 h-3" />
                        停用
                      </>
                    )}
                  </span>
                  <div className="flex gap-2">
                    <motion.button 
                      onClick={() => handleEdit(resource)}
                      className="text-indigo-600 hover:text-indigo-900 bg-indigo-100 hover:bg-indigo-200 rounded-lg px-3 py-1 text-sm transition-all duration-150 whitespace-nowrap"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      编辑
                    </motion.button>
                    <motion.button 
                      onClick={() => handleDelete(resource)}
                      className="text-red-600 hover:text-red-900 bg-red-100 hover:bg-red-200 rounded-lg px-3 py-1 text-sm transition-all duration-150 whitespace-nowrap"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      删除
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* 分页控件 */}
        {totalPages > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 flex items-center justify-center gap-2"
          >
            <div className="flex items-center gap-1">
              {/* 首页按钮 */}
              <motion.button
                onClick={handleFirstPage}
                disabled={currentPage === 1}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  currentPage === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-green-600'
                }`}
                whileHover={currentPage !== 1 ? { scale: 1.05 } : {}}
                whileTap={currentPage !== 1 ? { scale: 0.95 } : {}}
              >
                <FaAngleDoubleLeft className="w-4 h-4" />
              </motion.button>

              {/* 上一页按钮 */}
              <motion.button
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  currentPage === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-green-600'
                }`}
                whileHover={currentPage !== 1 ? { scale: 1.05 } : {}}
                whileTap={currentPage !== 1 ? { scale: 0.95 } : {}}
              >
                <FaChevronLeft className="w-4 h-4" />
              </motion.button>

              {/* 页码按钮 */}
              <div className="flex items-center gap-1 mx-2">
                {generatePageNumbers().map((page) => (
                  <motion.button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      page === currentPage
                        ? 'bg-green-500 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-green-600'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {page}
                  </motion.button>
                ))}
              </div>

              {/* 下一页按钮 */}
              <motion.button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  currentPage === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-green-600'
                }`}
                whileHover={currentPage !== totalPages ? { scale: 1.05 } : {}}
                whileTap={currentPage !== totalPages ? { scale: 0.95 } : {}}
              >
                <FaChevronRight className="w-4 h-4" />
              </motion.button>

              {/* 末页按钮 */}
              <motion.button
                onClick={handleLastPage}
                disabled={currentPage === totalPages}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  currentPage === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-green-600'
                }`}
                whileHover={currentPage !== totalPages ? { scale: 1.05 } : {}}
                whileTap={currentPage !== totalPages ? { scale: 0.95 } : {}}
              >
                <FaAngleDoubleRight className="w-4 h-4" />
              </motion.button>
            </div>

            {/* 页面信息 */}
            <div className="ml-4 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
              第 {currentPage} / {totalPages} 页，共 {totalItems} 条记录
            </div>
          </motion.div>
        )}
      </motion.div>

      <AddResourceModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />
      
      <EditResourceModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingResource(null);
        }}
        onSuccess={handleEditSuccess}
        resource={editingResource}
      />
    </div>
  );
} 