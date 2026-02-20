import React, { useEffect, useMemo, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { getApiBaseUrl } from '../api/api';
import { useNotification } from './Notification';
import { FaChartBar, FaSync, FaPlus, FaEdit, FaTrash, FaEye, FaTimes } from 'react-icons/fa';
import { useRef } from 'react';
import { handleSourceClick, handleSourceModalClose } from './EnvManager';

interface WebhookEventItem {
  _id: string;
  provider?: string;
  routeKey?: string | null;
  eventId?: string;
  type: string;
  title?: string;
  content?: string;
  renderedContent?: string;
  created_at?: string;
  to?: any;
  subject?: string;
  status?: string;
  data?: any;
  raw?: any;
  receivedAt?: string;
  updatedAt?: string;
}

const WebhookEventsManager: React.FC = () => {
  const [items, setItems] = useState<WebhookEventItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<WebhookEventItem | null>(null);
  const [editing, setEditing] = useState<WebhookEventItem | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  // grouping & filters
  const [groups, setGroups] = useState<{ routeKey: string | null; total: number }[]>([]);
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | 'null' | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { setNotification } = useNotification();

  // Zoom and auto-fit
  const [zoom, setZoom] = useState<number>(1);
  const [autoFit, setAutoFit] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const prefersReducedMotion = useReducedMotion();
  const hoverScale = React.useCallback((scale: number, enabled: boolean = true) => (
    enabled && !prefersReducedMotion ? { scale } : undefined
  ), [prefersReducedMotion]);
  const tapScale = React.useCallback((scale: number, enabled: boolean = true) => (
    enabled && !prefersReducedMotion ? { scale } : undefined
  ), [prefersReducedMotion]);

  const fetchList = async (p = page, ps = pageSize) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ page: String(p), pageSize: String(ps) });
      if (selectedRouteKey !== 'all') {
        params.set('routeKey', selectedRouteKey);
      }
      if (typeFilter.trim()) params.set('type', typeFilter.trim());
      if (statusFilter.trim()) params.set('status', statusFilter.trim());
      const res = await fetch(`${getApiBaseUrl()}/api/webhook-events?${params.toString()}` , {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      if (!res.ok) throw new Error('获取列表失败');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取列表失败');
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPage(data.page || p);
      setPageSize(data.pageSize || ps);
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || '获取列表失败' });
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${getApiBaseUrl()}/api/webhook-events/groups`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('获取分组失败');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取分组失败');
      setGroups(data.groups || []);
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || '获取分组失败' });
    }
  };

  useEffect(() => {
    fetchGroups();
    fetchList(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refetch when filters change
  useEffect(() => {
    fetchList(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteKey]);

  // Auto-fit zoom based on container width (target width: 1200px)
  useEffect(() => {
    if (!autoFit) return;
    let rafId: number | null = null;
    const update = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const w = containerRef.current?.clientWidth || window.innerWidth;
        const target = 1200; // base design width
        const scale = Math.min(1, Math.max(0.7, w / target));
        setZoom(Number(scale.toFixed(2)));
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [autoFit]);

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该事件记录？')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${getApiBaseUrl()}/api/webhook-events/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '删除失败');
      setNotification({ type: 'success', message: '删除成功' });
      fetchList(page, pageSize);
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || '删除失败' });
    }
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('token');
      const body = JSON.stringify(editing);
      const res = await fetch(`${getApiBaseUrl()}/api/webhook-events/${editing!._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '保存失败');
      setNotification({ type: 'success', message: '保存成功' });
      setEditing(null);
      fetchList(page, pageSize);
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || '保存失败' });
    }
  };

  const handleCreate = async () => {
    try {
      const token = localStorage.getItem('token');
      // Do not send _id when creating to avoid Mongo ObjectId cast errors
      const basePayload: Partial<WebhookEventItem> = creating ? (editing || {}) : {};
      const { _id, ...payload } = basePayload as any;
      const res = await fetch(`${getApiBaseUrl()}/api/webhook-events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '新增失败');
      setNotification({ type: 'success', message: '新增成功' });
      setCreating(false);
      setEditing(null);
      fetchList(1, pageSize);
    } catch (e: any) {
      setNotification({ type: 'error', message: e.message || '新增失败' });
    }
  };

  // 使用 handleSourceClick 的包装函数
  const openDetail = useCallback((item: WebhookEventItem) => {
    handleSourceClick(
      'webhook-event-detail',
      (source: string) => setSelected(source === 'webhook-event-detail' ? item : null),
      (show: boolean) => setSelected(show ? item : null),
      {
        storageKey: 'webhookEventsScrollPosition',
        getStorageValue: () => JSON.stringify({
          scrollY: window.scrollY,
          timestamp: Date.now(),
          eventId: item._id
        }),
        onBeforeOpen: () => { console.log('即将打开 Webhook 事件详情弹窗'); },
        onAfterOpen: () => { console.log('Webhook 事件详情弹窗已打开'); }
      }
    );
  }, []);

  const openEdit = useCallback((item: WebhookEventItem) => {
    handleSourceClick(
      'webhook-event-edit',
      (source: string) => setEditing(source === 'webhook-event-edit' ? item : null),
      (show: boolean) => setEditing(show ? item : null),
      {
        storageKey: 'webhookEventsEditScrollPosition',
        getStorageValue: () => JSON.stringify({
          scrollY: window.scrollY,
          timestamp: Date.now(),
          eventId: item._id
        }),
        onBeforeOpen: () => { console.log('即将打开 Webhook 事件编辑弹窗'); },
        onAfterOpen: () => { console.log('Webhook 事件编辑弹窗已打开'); }
      }
    );
  }, []);

  const openCreate = useCallback(() => {
    const newItem = { _id: '', type: '', provider: 'resend' } as any;
    handleSourceClick(
      'webhook-event-edit',
      (source: string) => {
        if (source === 'webhook-event-edit') {
          setCreating(true);
          setEditing(newItem);
        }
      },
      (show: boolean) => {
        if (show) {
          setCreating(true);
          setEditing(newItem);
        } else {
          setCreating(false);
          setEditing(null);
        }
      },
      {
        storageKey: 'webhookEventsCreateScrollPosition',
        getStorageValue: () => JSON.stringify({
          scrollY: window.scrollY,
          timestamp: Date.now(),
          action: 'create'
        }),
        onBeforeOpen: () => { console.log('即将打开 Webhook 事件创建弹窗'); },
        onAfterOpen: () => { console.log('Webhook 事件创建弹窗已打开'); }
      }
    );
  }, []);

  // 关闭弹窗的包装函数
  const closeDetailModal = useCallback(() => {
    handleSourceModalClose(
      (show: boolean) => setSelected(show ? selected : null),
      {
        storageKey: 'webhookEventsScrollPosition',
        getRestoreValue: () => {
          const saved = sessionStorage.getItem('webhookEventsScrollPosition');
          if (saved) {
            try {
              const data = JSON.parse(saved);
              if (Date.now() - data.timestamp < 5000) {
                return data.scrollY;
              }
            } catch (e) {
              const scrollY = parseInt(saved, 10);
              if (!isNaN(scrollY)) return scrollY;
            }
          }
          return 0;
        },
        onBeforeClose: () => { console.log('即将关闭 Webhook 事件详情弹窗'); },
        onAfterClose: () => { console.log('Webhook 事件详情弹窗已关闭'); }
      }
    );
  }, [selected]);

  const closeEditModal = useCallback(() => {
    handleSourceModalClose(
      (show: boolean) => {
        if (!show) {
          setEditing(null);
          setCreating(false);
        }
      },
      {
        storageKey: 'webhookEventsEditScrollPosition',
        getRestoreValue: () => {
          const saved = sessionStorage.getItem('webhookEventsEditScrollPosition');
          if (saved) {
            try {
              const data = JSON.parse(saved);
              if (Date.now() - data.timestamp < 5000) {
                return data.scrollY;
              }
            } catch (e) {
              const scrollY = parseInt(saved, 10);
              if (!isNaN(scrollY)) return scrollY;
            }
          }
          return 0;
        },
        onBeforeClose: () => { console.log('即将关闭 Webhook 事件编辑弹窗'); },
        onAfterClose: () => { console.log('Webhook 事件编辑弹窗已关闭'); }
      }
    );
  }, []);

  return (
    <div ref={containerRef} className="max-w-7xl mx-auto px-2 sm:px-4 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl shadow-xl border border-white/20 p-4 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow">
              <FaChartBar className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-semibold">Webhook 事件管理</div>
              <div className="text-white/80 text-sm">按路由分组、筛选与查看详情</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              onClick={() => fetchList(page, pageSize)}
              className="px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition text-sm font-medium"
              title="刷新"
              whileHover={hoverScale(1.02)}
              whileTap={tapScale(0.98)}
            >
              <span className="inline-flex items-center gap-2"><FaSync className="w-4 h-4" /> 刷新</span>
            </motion.button>
            <motion.button
              onClick={openCreate}
              className="px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition text-sm font-medium"
              whileHover={hoverScale(1.02)}
              whileTap={tapScale(0.98)}
            >
              <span className="inline-flex items-center gap-2"><FaPlus className="w-4 h-4" /> 新增</span>
            </motion.button>
          </div>
        </div>
        {/* Filters */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs text-white/80 mb-1">分组（routeKey）</label>
            <div className="flex flex-wrap gap-2">
              <select
                className="px-3 py-2 rounded-lg bg-white/20 text-white w-full sm:w-auto"
                value={selectedRouteKey}
                onChange={(e) => setSelectedRouteKey(e.target.value as any)}
              >
                <option value="all">全部</option>
                <option value="null">未分组</option>
                {groups.map(g => (
                  <option key={String(g.routeKey ?? 'null')}
                          value={g.routeKey ?? 'null'}>
                    {g.routeKey ?? '未分组'} ({g.total})
                  </option>
                ))}
              </select>
              <motion.button
                onClick={() => fetchGroups()}
                className="px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-sm"
                whileHover={hoverScale(1.02)}
                whileTap={tapScale(0.98)}
              >更新分组</motion.button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-white/80 mb-1">类型筛选(type)</label>
            <input value={typeFilter}
                   onChange={(e)=>setTypeFilter(e.target.value)}
                   onBlur={()=>fetchList(1, pageSize)}
                   placeholder="email.sent"
                   className="w-full px-3 py-2 rounded-lg bg-white/20 text-white placeholder-white/60" />
          </div>
          <div>
            <label className="block text-xs text-white/80 mb-1">状态筛选(status)</label>
            <input value={statusFilter}
                   onChange={(e)=>setStatusFilter(e.target.value)}
                   onBlur={()=>fetchList(1, pageSize)}
                   placeholder="processed"
                   className="w-full px-3 py-2 rounded-lg bg-white/20 text-white placeholder-white/60" />
          </div>
        </div>
      </motion.div>

      {/* List & Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
        {/* Mobile Cards */}
        <div className="block md:hidden divide-y divide-gray-100">
          {items.map(it => (
            <div key={it._id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">{it.type || '未分类'}</span>
                    {it.status && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${it.status === 'success' ? 'bg-green-100 text-green-700' : it.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{it.status}</span>
                    )}
                    {it.eventId && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-gray-100 text-gray-700 max-w-[60%] truncate" title={it.eventId}>#{it.eventId}</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{it.receivedAt ? new Date(it.receivedAt).toLocaleString('zh-CN') : '-'}</div>
                  {it.subject && <div className="text-sm text-gray-900 mt-1 truncate">{it.subject}</div>}
                  {it.title && it.title !== it.subject && <div className="text-sm text-gray-800 mt-1 truncate font-medium">📌 {it.title}</div>}
                  {it.renderedContent && <div className="text-xs text-gray-600 mt-1 line-clamp-2 whitespace-pre-wrap">{it.renderedContent}</div>}
                  {it.to && (
                    <div className="text-xs text-gray-600 mt-1 truncate">收件人：{typeof it.to === 'string' ? it.to : Array.isArray(it.to) ? it.to.join(', ') : '-'}</div>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-row sm:grid-cols-none">
                <motion.button className="w-full px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-medium flex items-center gap-2" onClick={() => openDetail(it)} whileHover={hoverScale(1.02)} whileTap={tapScale(0.98)}>
                  <FaEye className="w-3.5 h-3.5" /> 详情
                </motion.button>
                <motion.button className="w-full px-3 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 text-xs font-medium flex items-center gap-2" onClick={() => openEdit(it)} whileHover={hoverScale(1.02)} whileTap={tapScale(0.98)}>
                  <FaEdit className="w-3.5 h-3.5" /> 编辑
                </motion.button>
                <motion.button className="w-full px-3 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 text-xs font-medium flex items-center gap-2" onClick={() => handleDelete(it._id)} whileHover={hoverScale(1.02)} whileTap={tapScale(0.98)}>
                  <FaTrash className="w-3.5 h-3.5" /> 删除
                </motion.button>
              </div>
            </div>
          ))}
          {!loading && items.length === 0 && (
            <div className="p-6 text-center text-gray-400">暂无数据</div>
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full text-xs sm:text-sm table-fixed">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-600">
                <th className="p-3 w-28">类型</th>
                <th className="p-3 w-48 hidden md:table-cell">事件ID</th>
                <th className="p-3 w-48 hidden sm:table-cell">标题</th>
                <th className="p-3 w-64 hidden lg:table-cell">通知内容</th>
                <th className="p-3 w-24">状态</th>
                <th className="p-3 w-44">时间</th>
                <th className="p-3 w-40">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it._id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3 whitespace-nowrap">{it.type}</td>
                  <td className="p-3 truncate hidden md:table-cell" title={it.eventId || ''}>{it.eventId || '-'}</td>
                  <td className="p-3 truncate hidden sm:table-cell">{it.title || it.subject || '-'}</td>
                  <td className="p-3 hidden lg:table-cell">
                    <div className="truncate max-w-xs" title={it.renderedContent || ''}>
                      {it.renderedContent || (typeof it.to === 'string' ? it.to : Array.isArray(it.to) ? it.to.join(', ') : '-')}
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap">{it.status || '-'}</td>
                  <td className="p-3 whitespace-nowrap">{it.receivedAt ? new Date(it.receivedAt).toLocaleString('zh-CN') : '-'}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <motion.button className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-medium flex items-center gap-2" onClick={() => openDetail(it)} whileHover={hoverScale(1.02)} whileTap={tapScale(0.98)}>
                        <FaEye className="w-3.5 h-3.5" /> <span className="hidden sm:inline">详情</span>
                      </motion.button>
                      <motion.button className="px-2 py-1 rounded-lg bg-amber-500 text-white hover:bg-amber-600 text-xs font-medium" onClick={() => openEdit(it)} whileHover={hoverScale(1.02)} whileTap={tapScale(0.98)}>
                        <FaEdit className="w-3.5 h-3.5" /> <span className="hidden sm:inline">编辑</span>
                      </motion.button>
                      <motion.button className="px-2 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 text-xs font-medium" onClick={() => handleDelete(it._id)} whileHover={hoverScale(1.02)} whileTap={tapScale(0.98)}>
                        <FaTrash className="w-3.5 h-3.5" /> <span className="hidden sm:inline">删除</span>
                      </motion.button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-gray-400" colSpan={7}>暂无数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {loading && <div className="p-4 text-gray-400">加载中…</div>}
      </motion.div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-gray-50 border border-gray-100 rounded-2xl">
        <div className="text-sm text-gray-600">共 {total} 条 • 第 {page}/{totalPages} 页</div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <motion.button disabled={page <= 1} onClick={() => fetchList(page - 1, pageSize)} className="w-full sm:w-auto px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50" whileHover={hoverScale(1.02, page > 1)} whileTap={tapScale(0.98, page > 1)}>上一页</motion.button>
          <motion.button disabled={page >= totalPages} onClick={() => fetchList(page + 1, pageSize)} className="w-full sm:w-auto px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50" whileHover={hoverScale(1.02, page < totalPages)} whileTap={tapScale(0.98, page < totalPages)}>下一页</motion.button>
        </div>
      </div>

      {/* 详情弹窗 — Portal 到 body 以逃逸 backdrop-blur 产生的 stacking context */}
      {ReactDOM.createPortal(
        <AnimatePresence>
          {selected && (
            <motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="bg-white/90 backdrop-blur rounded-2xl max-w-3xl w-[95vw] p-4 sm:p-6 border border-white/20 shadow-xl" initial={{ scale: 0.95, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 10, opacity: 0 }} data-source-modal="webhook-event-detail">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-gray-900">事件详情</div>
                  <motion.button onClick={closeDetailModal} className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2" whileHover={hoverScale(1.02)} whileTap={tapScale(0.98)}>
                    <FaTimes className="w-4 h-4" /> 关闭
                  </motion.button>
                </div>
                {/* 结构化通知摘要 */}
                {(selected.title || selected.renderedContent) && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
                    {selected.title && <div className="text-sm font-semibold text-gray-900">📌 {selected.title}</div>}
                    {selected.renderedContent && <div className="text-sm text-gray-700 whitespace-pre-wrap">{selected.renderedContent}</div>}
                    {selected.content && selected.content !== selected.renderedContent && (
                      <div className="text-xs text-gray-400 mt-1">模板: {selected.content}</div>
                    )}
                  </div>
                )}
                <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-auto max-h-[70vh]">{JSON.stringify(selected, null, 2)}</pre>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* 编辑/创建弹窗 — Portal 到 body */}
      {ReactDOM.createPortal(
        <AnimatePresence>
          {(editing || creating) && (
            <motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="bg-white/90 backdrop-blur rounded-2xl max-w-2xl w-[95vw] p-4 sm:p-6 space-y-4 border border-white/20 shadow-xl" initial={{ scale: 0.95, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 10, opacity: 0 }} data-source-modal="webhook-event-edit">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-900">{creating ? '新增事件' : '编辑事件'}</div>
                <motion.button onClick={closeEditModal} className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2" whileHover={hoverScale(1.02)} whileTap={tapScale(0.98)}>
                  <FaTimes className="w-4 h-4" /> 关闭
                </motion.button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">类型</label>
                  <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" value={editing?.type || ''} onChange={e => setEditing({ ...(editing as any), type: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">事件ID</label>
                  <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" value={editing?.eventId || ''} onChange={e => setEditing({ ...(editing as any), eventId: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">分组(routeKey)</label>
                  <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" value={editing?.routeKey ?? ''} onChange={e => setEditing({ ...(editing as any), routeKey: e.target.value || null })} />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">主题</label>
                  <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" value={editing?.subject || ''} onChange={e => setEditing({ ...(editing as any), subject: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">状态</label>
                  <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" value={editing?.status || ''} onChange={e => setEditing({ ...(editing as any), status: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-600 mb-1">标题(title)</label>
                  <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" value={editing?.title || ''} onChange={e => setEditing({ ...(editing as any), title: e.target.value })} placeholder="通知标题" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-600 mb-1">内容模板(content)</label>
                  <textarea className="w-full px-3 py-2 h-20 rounded-lg bg-gray-50 border border-gray-200" value={editing?.content || ''} onChange={e => setEditing({ ...(editing as any), content: e.target.value })} placeholder="支持 {{value}} 占位符" />
                </div>
                {editing?.renderedContent && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">渲染后内容(renderedContent)</label>
                    <div className="w-full px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm text-gray-700 whitespace-pre-wrap">{editing.renderedContent}</div>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-600 mb-1">收件人(to)</label>
                  <input className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200" value={typeof editing?.to === 'string' ? (editing?.to || '') : JSON.stringify(editing?.to || '')} onChange={e => {
                    let value: any = e.target.value;
                    try { value = JSON.parse(e.target.value); } catch {}
                    setEditing({ ...(editing as any), to: value });
                  }} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-600 mb-1">数据(data)</label>
                  <textarea
                    className="w-full px-3 py-2 h-32 rounded-lg bg-gray-50 border border-gray-200"
                    value={
                      editing?.data == null
                        ? ''
                        : (typeof editing.data === 'string'
                            ? (editing.data as string)
                            : JSON.stringify(editing.data, null, 2))
                    }
                    onChange={e => {
                      const raw = e.target.value;
                      // Try parse as JSON; if fails, keep as raw string
                      try {
                        const parsed = JSON.parse(raw);
                        setEditing({ ...(editing as any), data: parsed });
                      } catch {
                        setEditing({ ...(editing as any), data: raw });
                      }
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                {!creating && (
                  <motion.button onClick={handleSave} className="px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium flex items-center gap-2" whileHover={hoverScale(1.02)} whileTap={tapScale(0.98)}>
                    <FaEdit className="w-4 h-4" /> 保存
                  </motion.button>
                )}
                {creating && (
                  <motion.button onClick={handleCreate} className="px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium flex items-center gap-2" whileHover={hoverScale(1.02)} whileTap={tapScale(0.98)}>
                    <FaPlus className="w-4 h-4" /> 创建
                  </motion.button>
                )}
              </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default WebhookEventsManager;
