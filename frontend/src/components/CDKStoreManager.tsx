import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPlus, FaEdit, FaTrash, FaSearch, FaSync, FaInfoCircle, FaExclamationTriangle, FaCheckCircle, FaArrowLeft, FaList, FaKey, FaBox, FaClock, FaUser, FaToggleOn, FaToggleOff, FaChevronLeft, FaChevronRight, FaAngleDoubleLeft, FaAngleDoubleRight } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { cdksApi, CDK } from '../api/cdks';
import { resourcesApi, Resource } from '../api/resources';
import { getApiBaseUrl } from '../api/api';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import { useNotification } from './Notification';

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
  const { setNotification } = useNotification();

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

      setNotification({
        message: `成功生成 ${formData.count} 个CDK`,
        type: 'success'
      });

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
      setNotification({
        message: '生成CDK失败，请重试',
        type: 'error'
      });
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
                            setNotification({ message: '测试资源初始化成功！', type: 'success' });
                          } else {
                            setNotification({ message: '初始化失败，请检查权限', type: 'error' });
                          }
                        } catch (error) {
                          console.error('初始化测试资源失败:', error);
                          setNotification({ message: '初始化失败', type: 'error' });
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
                  max="5000"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
                  value={formData.count}
                  onChange={(e) => setFormData({ ...formData, count: parseInt(e.target.value) || 1 })}
                />
                <p className="mt-1 text-xs text-gray-500">单次最多可生成5000个CDK，数据库最多支持10万个CDK</p>
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
  const { setNotification } = useNotification();

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

      setNotification({
        message: 'CDK更新成功',
        type: 'success'
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('更新CDK失败:', error);
      setError('更新CDK失败，请重试');
      setNotification({
        message: '更新CDK失败，请重试',
        type: 'error'
      });
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
  // 分页相关状态
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  // 批量选择相关状态
  const [selectedCDKs, setSelectedCDKs] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [totalCDKCount, setTotalCDKCount] = useState(0);
  const { setNotification } = useNotification();

  // 虚拟滚动相关状态
  const [containerHeight, setContainerHeight] = useState(600);
  const [scrollTop, setScrollTop] = useState(0);
  const itemHeight = 120; // 每个CDK项目的预估高度
  const overscan = 5; // 额外渲染的项目数量，确保平滑滚动

  useEffect(() => {
    console.log('CDKStoreManager: 组件已加载');
    fetchCDKs();
  }, []);

  // 当页码变化时重新获取数据
  useEffect(() => {
    if (currentPage > 1) {
      fetchCDKs();
    }
  }, [currentPage]);

  const fetchCDKs = async (page = currentPage) => {
    try {
      setLoading(true);
      const response = await cdksApi.getCDKs(page);
      setCdks(response.cdks);
      setTotalItems(response.total);
      setCurrentPage(response.page);
      setPageSize(response.pageSize);
      setTotalPages(Math.ceil(response.total / response.pageSize));
    } catch (error) {
      console.error('获取CDK列表失败:', error);
      setNotification({
        message: '获取CDK列表失败，请重试',
        type: 'error'
      });
      // 设置默认值，防止组件崩溃
      setCdks([]);
      setTotalItems(0);
      setTotalPages(1);
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

  const handleEdit = (cdk: CDK) => {
    setEditingCDK(cdk);
    setShowEditModal(true);
  };

  const handleDelete = async (cdk: CDK) => {
    // 使用浏览器原生确认对话框，因为这是关键操作
    if (window.confirm(`确定要删除CDK"${cdk.code}"吗？此操作不可撤销。`)) {
      try {
        await cdksApi.deleteCDK(cdk.id);
        setNotification({
          message: `成功删除CDK: ${cdk.code}`,
          type: 'success'
        });
        fetchCDKs(); // 重新获取CDK列表
      } catch (error) {
        console.error('删除CDK失败:', error);
        setNotification({
          message: '删除CDK失败，请重试',
          type: 'error'
        });
      }
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCDKs().then(() => {
      setRefreshing(false);
      setNotification({
        message: 'CDK列表已刷新',
        type: 'success'
      });
    }).catch(() => {
      setRefreshing(false);
    });
  };

  // 批量选择相关函数
  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    if (isSelectMode) {
      setSelectedCDKs(new Set());
    }
  };

  const toggleSelectCDK = (cdkId: string) => {
    const newSelected = new Set(selectedCDKs);
    if (newSelected.has(cdkId)) {
      newSelected.delete(cdkId);
    } else {
      newSelected.add(cdkId);
    }
    setSelectedCDKs(newSelected);
  };

  const selectAllCDKs = () => {
    const unusedCDKs = filteredCDKs.filter(cdk => !cdk.isUsed);
    setSelectedCDKs(new Set(unusedCDKs.map(cdk => cdk.id)));
  };

  const clearSelection = () => {
    setSelectedCDKs(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedCDKs.size === 0) {
      setNotification({
        message: '请选择要删除的CDK',
        type: 'warning'
      });
      return;
    }

    const selectedArray = Array.from(selectedCDKs);
    const selectedCDKObjects = cdks.filter(cdk => selectedArray.includes(cdk.id));
    const cdkCodes = selectedCDKObjects.map(cdk => cdk.code).join(', ');

    // 使用浏览器原生确认对话框，因为这是关键操作
    if (window.confirm(`确定要删除以下${selectedCDKs.size}个CDK吗？\n${cdkCodes}\n\n此操作不可撤销。`)) {
      setBatchDeleting(true);
      try {
        const result = await cdksApi.batchDeleteCDKs(selectedArray);
        setNotification({
          message: `批量删除成功！删除了 ${result.deletedCount} 个CDK`,
          type: 'success'
        });

        // 清空选择并退出选择模式
        setSelectedCDKs(new Set());
        setIsSelectMode(false);

        // 重新获取CDK列表
        fetchCDKs();
      } catch (error) {
        console.error('批量删除CDK失败:', error);
        setNotification({
          message: `批量删除失败：${error instanceof Error ? error.message : '请重试'}`,
          type: 'error'
        });
      } finally {
        setBatchDeleting(false);
      }
    }
  };

  // 删除所有CDK
  const handleDeleteAll = async () => {
    try {
      // 获取数据库中的真实CDK总数量
      const result = await cdksApi.getTotalCDKCount();
      setTotalCDKCount(result.totalCount);
      setShowDeleteAllDialog(true);
    } catch (error) {
      console.error('获取CDK总数量失败:', error);
      setNotification({
        message: '获取CDK总数量失败，请重试',
        type: 'error'
      });
    }
  };

  const handleConfirmDeleteAll = async () => {
    setDeleteAllLoading(true);
    try {
      const result = await cdksApi.deleteAllCDKs();
      setNotification({
        message: `成功删除所有CDK！共删除了 ${result.deletedCount} 个CDK`,
        type: 'success'
      });

      // 清空选择并退出选择模式
      setSelectedCDKs(new Set());
      setIsSelectMode(false);
      setShowDeleteAllDialog(false);

      // 重新获取CDK列表
      fetchCDKs();
    } catch (error) {
      console.error('删除所有CDK失败:', error);
      setNotification({
        message: `删除所有CDK失败：${error instanceof Error ? error.message : '请重试'}`,
        type: 'error'
      });
    } finally {
      setDeleteAllLoading(false);
    }
  };

  const handleCancelDeleteAll = () => {
    setShowDeleteAllDialog(false);
  };

  const filteredCDKs = cdks.filter(cdk =>
    cdk.code.toLowerCase().includes(search.toLowerCase()) ||
    cdk.resourceId.toLowerCase().includes(search.toLowerCase())
  );

  // 虚拟滚动计算
  const filteredItemsCount = filteredCDKs.length;
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(filteredItemsCount, startIndex + visibleCount + overscan * 2);
  const visibleItems = filteredCDKs.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  // 性能优化：当列表项较少时，不使用虚拟滚动
  const useVirtualScrolling = totalItems > 20;

  // 监听容器大小变化
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mobileContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const updateContainerHeight = () => {
      const ref = window.innerWidth >= 768 ? containerRef.current : mobileContainerRef.current;
      if (ref) {
        const rect = ref.getBoundingClientRect();
        setContainerHeight(Math.max(400, window.innerHeight - rect.top - 100));
      }
    };

    updateContainerHeight();
    window.addEventListener('resize', updateContainerHeight);
    return () => window.removeEventListener('resize', updateContainerHeight);
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

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
                <li>批量选择和删除多个未使用的CDK</li>
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
          <div className="flex items-center gap-3">
            {/* 批量操作按钮 */}
            <motion.button
              onClick={toggleSelectMode}
              className={`px-4 py-2 rounded-lg transition-all duration-200 font-medium flex items-center gap-2 ${isSelectMode
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isSelectMode ? <FaToggleOn className="w-4 h-4" /> : <FaToggleOff className="w-4 h-4" />}
              {isSelectMode ? '退出选择' : '批量选择'}
            </motion.button>

            <motion.button
              onClick={handleDeleteAll}
              disabled={cdks.length === 0}
              className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center gap-2"
              whileHover={cdks.length > 0 ? { scale: 1.02 } : {}}
              whileTap={cdks.length > 0 ? { scale: 0.98 } : {}}
            >
              <FaTrash className="w-4 h-4" />
              删除全部
            </motion.button>

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
        </div>

        {/* 批量操作控制栏 */}
        <AnimatePresence>
          {isSelectMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 pt-4 border-t border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">
                    已选择 {selectedCDKs.size} 个CDK
                  </span>
                  <div className="flex items-center gap-2">
                    <motion.button
                      onClick={selectAllCDKs}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition"
                      whileTap={{ scale: 0.95 }}
                    >
                      全选未使用
                    </motion.button>
                    <motion.button
                      onClick={clearSelection}
                      className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                      whileTap={{ scale: 0.95 }}
                    >
                      清空选择
                    </motion.button>
                  </div>
                </div>

                {selectedCDKs.size > 0 && (
                  <motion.button
                    onClick={handleBatchDelete}
                    disabled={batchDeleting}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 font-medium flex items-center gap-2"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <FaTrash className="w-4 h-4" />
                    {batchDeleting ? '删除中...' : `删除 ${selectedCDKs.size} 个`}
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* CDK列表 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
      >
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaList className="w-5 h-5 text-purple-500" />
            CDK列表
            {totalItems > 0 && (
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                共 {totalItems} 个
              </span>
            )}
          </h3>
          {totalPages > 1 && (
            <div className="text-sm text-gray-600">
              第 {currentPage} 页，共 {totalPages} 页
            </div>
          )}
        </div>

        {/* 桌面端表格视图 */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-gray-700">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="bg-gray-50 border-b border-gray-200">
                  {/* 批量选择复选框列 */}
                  {isSelectMode && (
                    <th className="py-3 px-3 text-center font-semibold text-gray-700 w-12">
                      <input
                        type="checkbox"
                        checked={filteredCDKs.filter(cdk => !cdk.isUsed).length > 0 &&
                          filteredCDKs.filter(cdk => !cdk.isUsed).every(cdk => selectedCDKs.has(cdk.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            selectAllCDKs();
                          } else {
                            clearSelection();
                          }
                        }}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                    </th>
                  )}
                  <th className="py-3 px-3 text-left font-semibold text-gray-700">CDK代码</th>
                  <th className="py-3 px-3 text-left font-semibold text-gray-700">资源ID</th>
                  <th className="py-3 px-3 text-left font-semibold text-gray-700">状态</th>
                  <th className="py-3 px-3 text-left font-semibold text-gray-700">使用时间</th>
                  <th className="py-3 px-3 text-left font-semibold text-gray-700">使用用户</th>
                  <th className="py-3 px-3 text-left font-semibold text-gray-700">过期时间</th>
                  <th className="py-3 px-3 text-center font-semibold text-gray-700">操作</th>
                </tr>
              </thead>
            </table>
          </div>

          {/* 虚拟滚动容器 */}
          <div
            ref={containerRef}
            className="overflow-auto border border-gray-200 rounded-b-lg"
            style={{ height: useVirtualScrolling ? `${containerHeight}px` : 'auto', maxHeight: `${containerHeight}px` }}
            onScroll={useVirtualScrolling ? handleScroll : undefined}
          >
            <div style={{ height: useVirtualScrolling ? `${filteredItemsCount * itemHeight}px` : 'auto', position: 'relative' }}>
              <div style={{ transform: useVirtualScrolling ? `translateY(${offsetY}px)` : 'none' }}>
                <table className="min-w-full text-sm text-gray-700">
                  <tbody>
                    {totalItems === 0 ? (
                      <tr>
                        <td colSpan={isSelectMode ? 8 : 7} className="text-center py-12 text-gray-400">
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
                    ) : (useVirtualScrolling ? visibleItems : filteredCDKs).map((cdk) => (
                      <tr key={`cdk-${cdk.id}`} className="border-b border-gray-100 hover:bg-gray-50" style={{ height: `${itemHeight}px` }}>
                        {/* 批量选择复选框 */}
                        {isSelectMode && (
                          <td className="whitespace-nowrap px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={selectedCDKs.has(cdk.id)}
                              onChange={() => toggleSelectCDK(cdk.id)}
                              disabled={cdk.isUsed}
                              className={`rounded border-gray-300 text-purple-600 focus:ring-purple-500 ${cdk.isUsed ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                            />
                          </td>
                        )}
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
                          <span className={`inline-flex items-center gap-2 rounded-full px-2 text-xs font-semibold leading-5 ${cdk.isUsed
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
                            <FaClock className="w-4 h-4 text-gray-400" />
                            {cdk.usedAt ? new Date(cdk.usedAt).toLocaleString() : '-'}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {cdk.isUsed && cdk.usedBy ? (
                            <div className="flex items-center gap-2">
                              <FaUser className="w-4 h-4 text-blue-500" />
                              <div className="flex flex-col">
                                <div className="text-xs text-gray-700">ID: {cdk.usedBy.userId}</div>
                                <div className="text-xs text-gray-600">{cdk.usedBy.username}</div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-gray-400">-</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          <div className="flex items-center gap-2">
                            <FaClock className="w-4 h-4 text-orange-400" />
                            {cdk.expiresAt ? new Date(cdk.expiresAt).toLocaleString() : '永不过期'}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-center">
                          <div className="flex justify-center space-x-2">
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
            </div>
          </div>
        </div>

        {/* 移动端卡片列表视图 */}
        <div className="md:hidden">
          <div
            ref={mobileContainerRef}
            className="overflow-auto"
            style={{ height: useVirtualScrolling ? `${containerHeight}px` : 'auto', maxHeight: `${containerHeight}px` }}
            onScroll={useVirtualScrolling ? handleScroll : undefined}
          >
            <div style={{ height: useVirtualScrolling ? `${totalItems * itemHeight}px` : 'auto', position: 'relative' }}>
              <div style={{ transform: useVirtualScrolling ? `translateY(${offsetY}px)` : 'none' }} className="space-y-3">
                {totalItems === 0 ? (
                  <div className="bg-white rounded-lg shadow p-6 text-center">
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
                ) : (useVirtualScrolling ? visibleItems : filteredCDKs).map((cdk) => (
                  <motion.div
                    key={`mobile-cdk-${cdk.id}`}
                    className="bg-white rounded-lg shadow-sm border border-gray-100 p-4"
                    style={{ minHeight: `${itemHeight}px` }}
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* CDK代码 */}
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* 批量选择复选框 */}
                        {isSelectMode && (
                          <input
                            type="checkbox"
                            checked={selectedCDKs.has(cdk.id)}
                            onChange={() => toggleSelectCDK(cdk.id)}
                            disabled={cdk.isUsed}
                            className={`rounded border-gray-300 text-purple-600 focus:ring-purple-500 mr-2 flex-shrink-0 ${cdk.isUsed ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                          />
                        )}
                        <FaKey className="w-5 h-5 text-purple-500 flex-shrink-0" />
                        <div className="font-mono text-lg font-bold text-gray-900 truncate">
                          {cdk.code}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <motion.button
                          onClick={() => handleEdit(cdk)}
                          className="text-blue-600 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 rounded-lg px-2 py-1 text-xs transition-all duration-150 whitespace-nowrap"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          查看
                        </motion.button>
                        {!cdk.isUsed && (
                          <motion.button
                            onClick={() => handleDelete(cdk)}
                            className="text-red-600 hover:text-red-900 bg-red-100 hover:bg-red-200 rounded-lg px-2 py-1 text-xs transition-all duration-150 whitespace-nowrap"
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
                        <FaBox className="w-3 h-3 flex-shrink-0" />
                        资源ID
                      </div>
                      <div className="text-sm text-gray-700 break-all font-mono">{cdk.resourceId}</div>
                    </div>

                    {/* 状态和时间信息 */}
                    <div className="flex flex-col gap-2 text-xs text-gray-500">
                      <div className="flex flex-col gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 text-xs font-semibold leading-5 w-fit ${cdk.isUsed
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
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">使用时间:</span>
                            <span className="text-gray-700">{cdk.usedAt ? new Date(cdk.usedAt).toLocaleDateString() : '-'}</span>
                          </div>
                          {cdk.usedAt && (
                            <div className="text-gray-400">
                              {new Date(cdk.usedAt).toLocaleTimeString()}
                            </div>
                          )}
                          {cdk.isUsed && cdk.usedBy && (
                            <div className="flex flex-col gap-1 mt-2 p-2 bg-blue-50 rounded">
                              <div className="flex items-center gap-1">
                                <FaUser className="w-3 h-3 text-blue-500" />
                                <span className="text-gray-400">使用用户:</span>
                              </div>
                              <div className="text-xs text-gray-700 ml-4">
                                <div>用户ID: {cdk.usedBy.userId}</div>
                                <div>用户名: {cdk.usedBy.username}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 过期时间 */}
                    <div className="mt-2 text-xs text-gray-500">
                      <div className="flex items-start gap-1">
                        <FaClock className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span className="break-words">过期时间: {cdk.expiresAt ? new Date(cdk.expiresAt).toLocaleString() : '永不过期'}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
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
                    : 'text-gray-600 hover:bg-gray-100 hover:text-purple-600'
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
                    : 'text-gray-600 hover:bg-gray-100 hover:text-purple-600'
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
                        ? 'bg-purple-500 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-purple-600'
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
                    : 'text-gray-600 hover:bg-gray-100 hover:text-purple-600'
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
                    : 'text-gray-600 hover:bg-gray-100 hover:text-purple-600'
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

      {/* 删除所有CDK确认对话框 */}
      <AnimatePresence>
        {showDeleteAllDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={handleCancelDeleteAll}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0">
                  <FaExclamationTriangle className="w-8 h-8 text-red-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    危险操作确认
                  </h3>
                  <p className="text-sm text-gray-500">
                    此操作将删除所有CDK
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-gray-700 mb-2">
                    您即将删除
                    <span className="font-semibold text-red-600">
                      数据库中所有 {totalCDKCount} 个CDK
                    </span>
                    （包括已使用和未使用的CDK）
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>此操作不可撤销！</strong>删除后将无法恢复任何CDK数据。
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <motion.button
                  onClick={handleCancelDeleteAll}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  取消
                </motion.button>
                <motion.button
                  onClick={handleConfirmDeleteAll}
                  disabled={deleteAllLoading}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 disabled:opacity-50 transition-all duration-200 font-medium flex items-center justify-center gap-2"
                  whileHover={!deleteAllLoading ? { scale: 1.02 } : {}}
                  whileTap={!deleteAllLoading ? { scale: 0.98 } : {}}
                >
                  {deleteAllLoading ? (
                    <>
                      <FaSync className="animate-spin w-4 h-4" />
                      删除中...
                    </>
                  ) : (
                    <>
                      <FaTrash className="w-4 h-4" />
                      确认删除全部
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
} 