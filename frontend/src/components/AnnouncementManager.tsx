import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import getApiBaseUrl from '../api';
import { useNotification } from './Notification';
import { useAuth } from '../hooks/useAuth';
import { 
  FaBullhorn, 
  FaEdit, 
  FaSave, 
  FaTrash, 
  FaTimes,
  FaEye,
  FaEyeSlash,
  FaMarkdown,
  FaCode
} from 'react-icons/fa';

const API_URL = getApiBaseUrl() + '/api/admin/announcement';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

function renderMarkdownSafe(md: string) {
  let html: string;
  try {
    html = marked(md) as string;
  } catch {
    html = md;
  }
  return DOMPurify.sanitize(html);
}

const AnnouncementManager: React.FC = () => {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'markdown' | 'html'>('markdown');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const { setNotification } = useNotification();

  // 获取公告
  const fetchAnnouncement = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_URL, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) {
        switch (data.error) {
          case '未携带Token，请先登录':
            setNotification({ message: '请先登录后再操作', type: 'error' });
            break;
          case 'Token格式错误，需以Bearer开头':
          case 'Token为空':
          case '无效的认证令牌':
          case '认证令牌已过期':
            setNotification({ message: '登录状态已失效，请重新登录', type: 'error' });
            break;
          case '用户不存在':
            setNotification({ message: '用户不存在，请重新登录', type: 'error' });
            break;
          case '需要管理员权限':
          case '无权限':
            setNotification({ message: '需要管理员权限', type: 'error' });
            break;
          default:
            setNotification({ message: data.error || '获取公告失败', type: 'error' });
        }
        setContent('');
        setFormat('markdown');
        setLoading(false);
        return;
      }
      if (data.success && data.announcement) {
        setContent(data.announcement.content || '');
        setFormat(data.announcement.format || 'markdown');
      } else {
        setContent('');
      }
    } catch (e) {
      setNotification({ message: '获取公告失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncement();
  }, []);

  // 保存公告
  const saveAnnouncement = async () => {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ content, format }),
      });
      const data = await res.json();
      if (!res.ok) {
        switch (data.error) {
          case '未携带Token，请先登录':
            setNotification({ message: '请先登录后再操作', type: 'error' });
            break;
          case 'Token格式错误，需以Bearer开头':
          case 'Token为空':
          case '无效的认证令牌':
          case '认证令牌已过期':
            setNotification({ message: '登录状态已失效，请重新登录', type: 'error' });
            break;
          case '用户不存在':
            setNotification({ message: '用户不存在，请重新登录', type: 'error' });
            break;
          case '需要管理员权限':
          case '无权限':
            setNotification({ message: '需要管理员权限', type: 'error' });
            break;
          default:
            setNotification({ message: data.error || '保存失败', type: 'error' });
        }
        return;
      }
      if (data.success) {
        setNotification({ message: '保存成功', type: 'success' });
        setEditing(false);
        fetchAnnouncement();
      } else {
        setNotification({ message: data.error || '保存失败', type: 'error' });
      }
    } catch (e) {
      setNotification({ message: '保存失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')), type: 'error' });
    }
  };

  // 删除公告
  const deleteAnnouncement = async () => {
    if (!window.confirm('确定要删除所有公告吗？')) return;
    try {
      const res = await fetch(API_URL, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        switch (data.error) {
          case '未携带Token，请先登录':
            setNotification({ message: '请先登录后再操作', type: 'error' });
            break;
          case 'Token格式错误，需以Bearer开头':
          case 'Token为空':
          case '无效的认证令牌':
          case '认证令牌已过期':
            setNotification({ message: '登录状态已失效，请重新登录', type: 'error' });
            break;
          case '用户不存在':
            setNotification({ message: '用户不存在，请重新登录', type: 'error' });
            break;
          case '需要管理员权限':
          case '无权限':
            setNotification({ message: '需要管理员权限', type: 'error' });
            break;
          default:
            setNotification({ message: data.error || '删除失败', type: 'error' });
        }
        return;
      }
      if (data.success) {
        setContent('');
        setNotification({ message: '已删除', type: 'success' });
      } else {
        setNotification({ message: data.error || '删除失败', type: 'error' });
      }
    } catch (e) {
      setNotification({ message: '删除失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')), type: 'error' });
    }
  };

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
              公告管理仅限管理员使用
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

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
          <FaBullhorn className="text-2xl text-blue-600" />
          公告管理
        </h2>
        <div className="text-gray-600 space-y-2">
          <p>管理系统公告内容，支持 Markdown 和 HTML 格式。</p>
          <div className="flex items-start gap-2 text-sm">
            <div>
              <p className="font-semibold text-blue-700">功能说明：</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>支持 Markdown 和 HTML 格式</li>
                <li>实时预览公告效果</li>
                <li>安全的内容过滤</li>
                <li>仅管理员可操作</li>
              </ul>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 公告内容卡片 */}
      <motion.div 
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FaEdit className="text-lg text-blue-500" />
            公告内容
          </h3>
          <motion.button
            onClick={fetchAnnouncement}
            disabled={loading}
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 text-sm font-medium flex items-center gap-2"
            whileTap={{ scale: 0.95 }}
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新
          </motion.button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            加载中...
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {editing ? (
              <motion.div
                key="edit"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    公告内容
                  </label>
                  <textarea
                    className="w-full h-40 border-2 border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="请输入公告内容"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    格式选择
                  </label>
                  <div className="flex items-center space-x-6">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        checked={format === 'markdown'}
                        onChange={() => setFormat('markdown')}
                        className="mr-2 text-blue-500"
                      />
                      <span className="text-sm">Markdown</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        checked={format === 'html'}
                        onChange={() => setFormat('html')}
                        className="mr-2 text-blue-500"
                      />
                      <span className="text-sm">HTML</span>
                    </label>
                  </div>
                </div>
                
                <div className="flex space-x-3">
                  <motion.button
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 font-medium"
                    onClick={saveAnnouncement}
                    disabled={!content.trim()}
                    whileTap={{ scale: 0.95 }}
                  >
                    保存
                  </motion.button>
                  <motion.button
                    className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium"
                    onClick={() => setEditing(false)}
                    whileTap={{ scale: 0.95 }}
                  >
                    取消
                  </motion.button>
                  <motion.button
                    className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium"
                    onClick={deleteAnnouncement}
                    whileTap={{ scale: 0.95 }}
                  >
                    删除公告
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="view"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    公告预览
                  </label>
                  <div className="border-2 border-gray-200 rounded-lg p-4 min-h-[120px] bg-gray-50">
                    {content ? (
                      format === 'markdown' ? (
                        <div 
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(content) }} 
                        />
                      ) : (
                        <div 
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} 
                        />
                      )
                    ) : (
                      <div className="text-gray-400 text-center py-8">
                        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        暂无公告内容
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex space-x-3">
                  <motion.button
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium"
                    onClick={() => setEditing(true)}
                    whileTap={{ scale: 0.95 }}
                  >
                    编辑公告
                  </motion.button>
                  {content && (
                    <motion.button
                      className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium"
                      onClick={deleteAnnouncement}
                      whileTap={{ scale: 0.95 }}
                    >
                      删除公告
                    </motion.button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </motion.div>
    </motion.div>
  );
};

export default AnnouncementManager; 