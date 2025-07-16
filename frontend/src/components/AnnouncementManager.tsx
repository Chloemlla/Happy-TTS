import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const API_URL = '/api/admin/announcement';

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
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'markdown' | 'html'>('markdown');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 获取公告
  const fetchAnnouncement = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(API_URL, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        switch (data.error) {
          case '未携带Token，请先登录':
            setError('请先登录后再操作');
            break;
          case 'Token格式错误，需以Bearer开头':
          case 'Token为空':
          case '无效的认证令牌':
          case '认证令牌已过期':
            setError('登录状态已失效，请重新登录');
            break;
          case '用户不存在':
            setError('用户不存在，请重新登录');
            break;
          case '需要管理员权限':
          case '无权限':
            setError('需要管理员权限');
            break;
          default:
            setError(data.error || '获取公告失败');
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
      setError('获取公告失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncement();
  }, []);

  // 保存公告
  const saveAnnouncement = async () => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content, format }),
      });
      const data = await res.json();
      if (!res.ok) {
        switch (data.error) {
          case '未携带Token，请先登录':
            setError('请先登录后再操作');
            break;
          case 'Token格式错误，需以Bearer开头':
          case 'Token为空':
          case '无效的认证令牌':
          case '认证令牌已过期':
            setError('登录状态已失效，请重新登录');
            break;
          case '用户不存在':
            setError('用户不存在，请重新登录');
            break;
          case '需要管理员权限':
          case '无权限':
            setError('需要管理员权限');
            break;
          default:
            setError(data.error || '保存失败');
        }
        return;
      }
      if (data.success) {
        setSuccess('保存成功');
        setEditing(false);
        fetchAnnouncement();
      } else {
        setError(data.error || '保存失败');
      }
    } catch (e) {
      setError('保存失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')));
    }
  };

  // 删除公告
  const deleteAnnouncement = async () => {
    if (!window.confirm('确定要删除所有公告吗？')) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch(API_URL, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        switch (data.error) {
          case '未携带Token，请先登录':
            setError('请先登录后再操作');
            break;
          case 'Token格式错误，需以Bearer开头':
          case 'Token为空':
          case '无效的认证令牌':
          case '认证令牌已过期':
            setError('登录状态已失效，请重新登录');
            break;
          case '用户不存在':
            setError('用户不存在，请重新登录');
            break;
          case '需要管理员权限':
          case '无权限':
            setError('需要管理员权限');
            break;
          default:
            setError(data.error || '删除失败');
        }
        return;
      }
      if (data.success) {
        setContent('');
        setSuccess('已删除');
      } else {
        setError(data.error || '删除失败');
      }
    } catch (e) {
      setError('删除失败：' + (e instanceof Error ? e.message : (e && e.toString ? e.toString() : '未知错误')));
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-6">公告管理</h2>
      {loading ? (
        <div className="text-gray-400">加载中…</div>
      ) : (
        <AnimatePresence mode="wait">
          {editing ? (
            <motion.div
              key="edit"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
              className="mb-4"
            >
              {error && <div className="text-red-500 mb-2">{error}</div>}
              {success && <div className="text-green-600 mb-2">{success}</div>}
              <textarea
                className="w-full h-40 border rounded-lg p-3 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="请输入公告内容"
              />
              <div className="mb-4 flex items-center space-x-6">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    checked={format === 'markdown'}
                    onChange={() => setFormat('markdown')}
                    className="mr-1"
                  /> Markdown
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    checked={format === 'html'}
                    onChange={() => setFormat('html')}
                    className="mr-1"
                  /> HTML
                </label>
              </div>
              <div className="flex space-x-3">
                <button
                  className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-semibold shadow hover:bg-indigo-700 transition"
                  onClick={saveAnnouncement}
                  disabled={!content.trim()}
                >保存</button>
                <button
                  className="bg-gray-100 text-gray-700 px-5 py-2 rounded-lg font-semibold shadow hover:bg-gray-200 transition"
                  onClick={() => setEditing(false)}
                >取消</button>
                <button
                  className="bg-red-500 text-white px-5 py-2 rounded-lg font-semibold shadow hover:bg-red-600 transition"
                  onClick={deleteAnnouncement}
                >删除公告</button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="view"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
              className="mb-4"
            >
              {error && <div className="text-red-500 mb-2">{error}</div>}
              {success && <div className="text-green-600 mb-2">{success}</div>}
              <div className="prose mb-4 border rounded-lg p-4 min-h-[80px] bg-gray-50">
                {content ? (
                  format === 'markdown' ? (
                    <span dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(content) }} />
                  ) : (
                    <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
                  )
                ) : (
                  <span className="text-gray-400">暂无公告</span>
                )}
              </div>
              <div className="flex space-x-3">
                <button
                  className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-semibold shadow hover:bg-indigo-700 transition"
                  onClick={() => setEditing(true)}
                >编辑公告</button>
                {content && (
                  <button
                    className="bg-red-500 text-white px-5 py-2 rounded-lg font-semibold shadow hover:bg-red-600 transition"
                    onClick={deleteAnnouncement}
                  >删除公告</button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

export default AnnouncementManager; 